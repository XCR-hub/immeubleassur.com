import assert from "node:assert/strict";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { classifyInboxMessage, reconcileStoredInbox } from "./imap-inbox-classification.js";
import { openLocalSqlite } from "./local-sqlite-db.js";

const base={case_id:null,matched_reference:"",status:"received_pending_review",sender:"ImmeubleAssur <team@immeubleassur.com>",recipients:"team@immeubleassur.com",subject:"Alerte ImmeubleAssur production",payload:'{"original":"preserved"}'};
test("only strict self-addressed operational notifications can leave the commercial review queue",()=>{
  assert.equal(classifyInboxMessage(base)?.status,"ignored_automation");
  for(const change of [{sender:"client@example.test"},{sender:"team@immeubleassur.com,client@example.test"},{recipients:"team@immeubleassur.com,client@example.test"},{subject:"Re: Alerte ImmeubleAssur production"},{subject:"Alerte ImmeubleAssur production DOS-ABCD"},{case_id:"existing-case"},{matched_reference:"DOS-ABCD"},{status:"reviewed"}]) assert.equal(classifyInboxMessage({...base,...change}),null);
});
test("lead notifications need one exact existing lead and retain a commercial follow-up link",()=>{
  const message={...base,subject:"Retour prospect ImmeubleAssur IMB-20261110-ABCDEF12 - TELEPHONE SEUL"};
  assert.equal(classifyInboxMessage(message),null);
  const lead={id:"lead-1",reference:"IMB-20261110-ABCDEF12"};
  assert.equal(classifyInboxMessage(message,()=>[lead,lead]),null);
  assert.deepEqual(classifyInboxMessage(message,reference=>reference===lead.reference?[lead]:[]),{status:"linked_lead_notification",reason:"known-lead-notification",lead_id:lead.id,reference:lead.reference});
});
test("stored header reconciliation is reversible, idempotent and preserves customer and case messages",t=>{
  const parent=realpathSync(tmpdir());const root=mkdtempSync(join(parent,"immeubleassur-inbox-test-"));
  let db;
  t.after(()=>{db?.close();if(existsSync(root)){const checked=relative(parent,realpathSync(root));assert.ok(!checked.startsWith("..")&&basename(root).startsWith("immeubleassur-inbox-test-"));rmSync(root,{recursive:true,force:true});}});
  const setup=new DatabaseSync(join(root,"inbox.sqlite"));
  setup.exec("CREATE TABLE brokerage_cases(id TEXT,client_portal_token_revoked_at TEXT)");setup.close();
  db=openLocalSqlite({dbPath:join(root,"inbox.sqlite"),schemaPath:null});
  db.exec("CREATE TABLE leads(id TEXT PRIMARY KEY,reference TEXT); CREATE TABLE case_mail_inbox(id TEXT PRIMARY KEY,case_id TEXT,sender TEXT,recipients TEXT,subject TEXT,matched_reference TEXT,status TEXT,payload TEXT,created_at TEXT,updated_at TEXT)");
  db.prepare("INSERT INTO leads VALUES(?,?)").bind("lead-1","IMB-20261110-ABCDEF12").run();
  const messages=[base,{...base,subject:"Nouveau lead ImmeubleAssur IMB-20261110-ABCDEF12 - TELEPHONE SEUL"},{...base,sender:"customer@example.test"},{...base,case_id:"case-1"},{...base,payload:"not-json"}];
  messages.forEach((row,index)=>db.prepare("INSERT INTO case_mail_inbox VALUES(?,?,?,?,?,?,?,?,?,?)").bind(String(index),row.case_id,row.sender,row.recipients,row.subject,row.matched_reference,row.status,row.payload,"2026-11-01T00:00:00Z","original-time").run());
  const before=db.prepare("SELECT * FROM case_mail_inbox ORDER BY id").all().results;
  const result=reconcileStoredInbox(db,"2026-11-10T20:00:00Z");
  assert.equal(result.classified_automation,1);assert.equal(result.linked_lead_notifications,1);
  const after=db.prepare("SELECT * FROM case_mail_inbox ORDER BY id").all().results;
  assert.equal(after.length,before.length);
  for(let index=0;index<after.length;index++)for(const field of ["sender","recipients","subject","created_at","case_id"]) assert.equal(after[index][field],before[index][field]);
  for(const index of [0,1]){const payload=JSON.parse(after[index].payload);assert.equal(payload.original,"preserved");assert.equal(payload.inbox_classification.previous_status,"received_pending_review");assert.equal(payload.inbox_classification.reversible,true);assert.equal(payload.inbox_classification.body_read,false);assert.equal(payload.inbox_classification.mailbox_changed,false);}
  for(const index of [2,3,4])assert.deepEqual(after[index],before[index]);
  assert.equal(JSON.parse(after[1].payload).inbox_classification.lead_id,"lead-1");
  const repeat=reconcileStoredInbox(db);assert.equal(repeat.classified_automation+repeat.linked_lead_notifications,0);
});
