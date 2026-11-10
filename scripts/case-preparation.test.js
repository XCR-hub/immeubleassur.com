import assert from "node:assert/strict";
import {mkdtempSync,realpathSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {basename,join,relative} from "node:path";
import {test} from "node:test";
import {openLocalSqlite} from "./local-sqlite-db.js";
import {onRequestGet,onRequestPost} from "../functions/api/admin/cases.js";

function fixture(t){
  const parent=realpathSync(tmpdir());const root=mkdtempSync(join(parent,"immeubleassur-case-preparation-"));
  const db=openLocalSqlite({dbPath:join(root,"crm.sqlite"),schemaPath:"schema.sql"});
  t.after(()=>{db.close();const checked=relative(parent,realpathSync(root));assert.ok(!checked.startsWith("..")&&basename(root).startsWith("immeubleassur-case-preparation-"));rmSync(root,{recursive:true,force:true});});
  let sent=0;const env={DB:db,ADMIN_API_TOKEN:"fixture-admin",SITE_ORIGIN:"https://example.test",SEND_SMTP_MAIL:async()=>{sent++;throw new Error("Unexpected fixture delivery");}};
  const seed=(id,status="new")=>db.prepare("INSERT INTO leads(id,reference,name,phone,email,profile,property_type,city,units_count,need,message,lead_score,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,"IMB-20261110-"+id,"Fixture "+id,"0100000000","","bailleur","parking","Paris","16","pno","Demande entrante",90,status,"fixture","2026-11-01T00:00:00Z","2026-11-01T00:00:00Z").run();
  const post=body=>onRequestPost({env,request:new Request("https://example.test/api/admin/cases",{method:"POST",headers:{Authorization:"Bearer fixture-admin","Content-Type":"application/json"},body:JSON.stringify(body)})});
  const get=sync=>onRequestGet({env,request:new Request("https://example.test/api/admin/cases?sync="+(sync?"1":"0"),{headers:{Authorization:"Bearer fixture-admin"}})});
  return {db,env,seed,post,get,sent:()=>sent};
}

test("targeted preparation creates only the selected case and leaves all contact in review",async t=>{
  const f=fixture(t);f.seed("AAAA1111");f.seed("BBBB2222");
  const response=await f.post({action:"prepare_lead",lead_id:"AAAA1111",actor:"fixture-reviewer"});
  assert.equal(response.status,200);const body=await response.json();assert.equal(body.already_exists,false);
  const cases=f.db.prepare("SELECT * FROM brokerage_cases").all().results;assert.equal(cases.length,1);assert.equal(cases[0].lead_id,"AAAA1111");
  const mails=f.db.prepare("SELECT * FROM case_mail_queue").all().results;assert.ok(mails.length>0);assert.ok(mails.every(row=>row.status==="draft_review"&&row.review_required===1&&!row.sent_at));
  assert.equal(f.sent(),0);assert.equal(JSON.stringify(body).includes(cases[0].client_portal_token),false);
});
test("repeated and concurrent preparation cannot duplicate or overwrite an existing case",async t=>{
  const f=fixture(t);f.seed("AAAA1111");
  const results=await Promise.all([f.post({action:"prepare_lead",lead_id:"AAAA1111"}),f.post({action:"prepare_lead",lead_id:"AAAA1111"})]);
  const replies=await Promise.all(results.map(response=>response.json()));assert.equal(replies.filter(row=>row.already_exists===false).length,1);
  const row=f.db.prepare("SELECT * FROM brokerage_cases").first();
  f.db.prepare("UPDATE brokerage_cases SET next_action=?,due_at=?,updated_at=? WHERE id=?").bind("Relire le questionnaire transmis avant toute consultation","2026-10-01T00:00:00Z","manual-time",row.id).run();
  const before=f.db.prepare("SELECT * FROM brokerage_cases").first();
  const reply=await(await f.post({action:"prepare_lead",lead_id:"AAAA1111"})).json();assert.equal(reply.already_exists,true);
  assert.deepEqual(f.db.prepare("SELECT * FROM brokerage_cases").first(),before);
  await f.get(true);const refreshed=f.db.prepare("SELECT * FROM brokerage_cases").first();
  assert.equal(refreshed.next_action,before.next_action);assert.equal(refreshed.due_at,before.due_at);
  assert.equal(f.db.prepare("SELECT count(*) n FROM brokerage_cases").first().n,1);assert.equal(f.sent(),0);
});
test("closed prospects are excluded from preparation, recommendations and all new mail approval or delivery",async t=>{
  const f=fixture(t);f.seed("AAAA1111");f.seed("BBBB2222","lost");
  const prepared=await(await f.post({action:"prepare_lead",lead_id:"AAAA1111"})).json();
  const row=prepared.case;f.db.prepare("UPDATE brokerage_cases SET stage='lost',next_action='Ne plus relancer',readiness_score=95 WHERE id=?").bind(row.id).run();
  f.db.prepare("UPDATE leads SET status='lost' WHERE id=?").bind("AAAA1111").run();
  const mail=f.db.prepare("SELECT * FROM case_mail_queue WHERE case_id=?").bind(row.id).first();
  f.db.prepare("UPDATE case_mail_queue SET status='approved',recipient_email='fixture@example.test' WHERE id=?").bind(mail.id).run();
  for(const action of ["prepare_lead","approve_mail","send_mail"]){const response=await f.post({action,lead_id:"AAAA1111",mail_id:mail.id});assert.equal(response.status,409);}
  assert.equal((await f.post({action:"prepare_lead",lead_id:"BBBB2222"})).status,409);
  const state=await(await f.get(false)).json();assert.equal(state.cases[0].action_plan.status,"closed");assert.equal(state.cases[0].insurer_package_readiness.status,"closed");
  assert.ok(state.crm_action_queue.every(action=>action.case_reference!==row.case_reference&&action.target!==row.case_reference));
  assert.ok(state.actions.every(action=>action.target!==row.case_reference));
  assert.equal(state.summary.hot_cases,0);assert.equal(state.summary.human_review_required,0);assert.equal(f.sent(),0);
});
test("targeted preparation requires authentication and an existing open lead",async t=>{
  const f=fixture(t);f.seed("AAAA1111");
  const denied=await onRequestPost({env:f.env,request:new Request("https://example.test/api/admin/cases",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"prepare_lead",lead_id:"AAAA1111"})})});
  assert.equal(denied.status,401);assert.equal((await f.post({action:"prepare_lead"})).status,422);assert.equal((await f.post({action:"prepare_lead",lead_id:"missing"})).status,404);
  assert.equal(f.db.prepare("SELECT count(*) n FROM brokerage_cases").first().n,0);
});

test("synchronization preserves a closed case even when the lead status is stale",async t=>{
  const f=fixture(t);f.seed("AAAA1111");
  const prepared=await(await f.post({action:"prepare_lead",lead_id:"AAAA1111"})).json();
  f.db.prepare("UPDATE brokerage_cases SET stage='lost',next_action='Ne plus relancer' WHERE id=?").bind(prepared.case.id).run();
  const before=f.db.prepare("SELECT * FROM brokerage_cases").first();
  await f.get(true);
  assert.deepEqual(f.db.prepare("SELECT * FROM brokerage_cases").first(),before);
  assert.equal(f.sent(),0);
});

test("lead closure alone removes case recommendations and prevents approval",async t=>{
  const f=fixture(t);f.seed("AAAA1111");
  const prepared=await(await f.post({action:"prepare_lead",lead_id:"AAAA1111"})).json();
  f.db.prepare("UPDATE leads SET status='archived' WHERE id='AAAA1111'").run();
  const mail=f.db.prepare("SELECT id FROM case_mail_queue WHERE case_id=?").bind(prepared.case.id).first();
  assert.equal((await f.post({action:"approve_mail",mail_id:mail.id})).status,409);
  const state=await(await f.get(false)).json();
  assert.equal(state.cases[0].action_plan.status,"closed");
  assert.ok(state.crm_action_queue.every(action=>action.case_reference!==prepared.case.case_reference));
  assert.ok(state.actions.every(action=>action.target!==prepared.case.case_reference));
  assert.equal(f.sent(),0);
});

test("delivery rechecks the recipient, mail version and closure after message preparation", async t => {
  for (const change of ["recipient", "version", "closed", "cancelled"]) {
    await t.test(change, async t => {
      const f = fixture(t);
      f.seed("AAAA1111");
      const prepared = await (await f.post({action: "prepare_lead", lead_id: "AAAA1111"})).json();
      const mail = f.db.prepare("SELECT id FROM case_mail_queue WHERE case_id=?").bind(prepared.case.id).first();
      f.db.prepare("UPDATE case_mail_queue SET status='approved',recipient_email='fixture@example.test',approved_at='2026-11-10T00:00:00Z',approved_by='fixture',updated_at='original' WHERE id=?").bind(mail.id).run();
      Object.assign(f.env, {SMTP_HOST: "smtp.example.test", SMTP_USER: "fixture", SMTP_PASS: "fixture"});
      f.env.DB = {...f.db, prepare(sql) {
        if (sql.startsWith("SELECT m.status, m.recipient_email, m.updated_at")) {
          const mutations = {
            recipient: "UPDATE case_mail_queue SET recipient_email='changed@example.test' WHERE id=?",
            version: "UPDATE case_mail_queue SET body='Changed after review',updated_at='changed' WHERE id=?",
            closed: "UPDATE brokerage_cases SET stage='lost' WHERE id=?",
            cancelled: "UPDATE case_mail_queue SET status='cancelled' WHERE id=?"
          };
          f.db.prepare(mutations[change]).bind(change === "closed" ? prepared.case.id : mail.id).run();
        }
        return f.db.prepare(sql);
      }};
      const response = await f.post({action: "send_mail", mail_id: mail.id});
      assert.equal(response.status, 409);
      assert.equal(f.sent(), 0);
      assert.equal(f.db.prepare("SELECT sent_at FROM case_mail_queue WHERE id=?").bind(mail.id).first().sent_at, null);
    });
  }
});

test("an unchanged approved fixture still reaches only the injected test transport", async t => {
  const f = fixture(t);
  f.seed("AAAA1111");
  const prepared = await (await f.post({action: "prepare_lead", lead_id: "AAAA1111"})).json();
  const mail = f.db.prepare("SELECT id FROM case_mail_queue WHERE case_id=?").bind(prepared.case.id).first();
  f.db.prepare("UPDATE case_mail_queue SET status='approved',recipient_email='fixture@example.test',approved_at='2026-11-10T00:00:00Z',approved_by='fixture' WHERE id=?").bind(mail.id).run();
  let transported = 0;
  Object.assign(f.env, {SMTP_HOST: "smtp.example.test", SMTP_USER: "fixture", SMTP_PASS: "fixture", SEND_SMTP_MAIL: async config => {
    assert.deepEqual(config.to, ["fixture@example.test"]);
    transported++;
    return "250 fixture accepted";
  }});
  assert.equal((await f.post({action: "send_mail", mail_id: mail.id})).status, 200);
  assert.equal(transported, 1);
  assert.equal(f.db.prepare("SELECT status FROM case_mail_queue WHERE id=?").bind(mail.id).first().status, "sent");
});

test("saved followup instructions take priority over generic contact recommendations while document blockers remain", async t => {
  const f = fixture(t);
  f.seed("AAAA1111");
  const prepared = await (await f.post({action: "prepare_lead", lead_id: "AAAA1111"})).json();
  for (const instruction of ["Rappel telephone : obtenir un email avant tout questionnaire.", "Attendre le retour du collegue avant toute relance de questionnaire."]) {
    f.db.prepare("UPDATE brokerage_cases SET next_action=? WHERE id=?").bind(instruction, prepared.case.id).run();
    const state = await (await f.get(false)).json();
    const row = state.cases.find(row => row.id === prepared.case.id);
    assert.equal(row.action_plan.next_action, instruction);
    assert.equal(row.insurer_package_readiness.next_action, instruction);
    assert.equal(row.action_plan.status, "blocked_documents");
    assert.equal(row.insurer_package_readiness.status, "blocked_documents");
    assert.ok(row.missing_required_documents > 0);
    const contactTypes = ["plan-dossier", "pack-assureur-bloque", "pieces-client"];
    const queue = state.crm_action_queue.filter(action => action.case_reference === row.case_reference && contactTypes.includes(action.type));
    assert.equal(queue.length, 3);
    assert.ok(queue.every(action => action.recommendation === instruction && action.quick_action === "open_case"));
    assert.ok(state.actions.filter(action => action.target === row.case_reference && ["plan-action-dossier", "pack-assureur-bloque", "pieces-client"].includes(action.type)).every(action => action.recommendation === instruction));
  }
  assert.equal(f.sent(), 0);
});
