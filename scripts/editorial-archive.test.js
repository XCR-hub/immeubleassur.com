import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { test } from "node:test";
import { archiveObsoleteDrafts } from "./archive-obsolete-editorial-drafts.js";

function fixture(t) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, "immeubleassur-editorial-archive-"));
  t.after(() => { const checked = relative(parent, realpathSync(root)); assert.ok(!checked.startsWith("..") && basename(root).startsWith("immeubleassur-editorial-archive-")); rmSync(root, {recursive:true,force:true}); });
  const draftsRoot = join(root, "drafts");
  const backupRoot = join(root, "backups");
  mkdirSync(draftsRoot);
  const draft = {marker:"editorial-ai-draft-review-v1",generated_at:"2026-08-19T18:00:00.000Z",publication_status:"quarantined",human_review_required:true,no_auto_publish:true,allowed_publication:false,issue:{slug:"news/veille-assurance-immeuble-2026-08-19"},legal_review:{human_review_required:true,allowed_publication:false},synthesis:{text:"Original private draft"}};
  const path = join(draftsRoot, "news-old.json");
  const original = JSON.stringify(draft);
  writeFileSync(path, original);
  return {root,path,draft,original,draftsRoot,backupRoot, options:{draftsRoot,backupRoot,before:"2026-09-01",now:Date.parse("2026-11-10T18:00:00.000Z")}};
}

test("obsolete drafts can be assessed without changing content or creating backups", t => {
  const f=fixture(t); const report=archiveObsoleteDrafts(f.options);
  assert.equal(report.eligible,1); assert.equal(report.archived,0);
  assert.equal(readFileSync(f.path,"utf8"),f.original); assert.equal(existsSync(f.backupRoot),false);
});
test("archival preserves the original and all publication restrictions without claiming human approval", t => {
  const f=fixture(t); const report=archiveObsoleteDrafts({...f.options,apply:true});
  assert.equal(report.archived,1); assert.equal(readFileSync(join(f.backupRoot,"news-old.json"),"utf8"),f.original);
  const saved=JSON.parse(readFileSync(f.path,"utf8"));
  assert.equal(saved.publication_status,"archived_obsolete"); assert.equal(saved.human_review_required,true);
  assert.equal(saved.no_auto_publish,true); assert.equal(saved.allowed_publication,false);
  assert.equal(saved.editorial_archive.human_approval_granted,false); assert.equal(saved.human_review,undefined);
  assert.deepEqual(saved.synthesis,f.draft.synthesis); assert.deepEqual(saved.legal_review,f.draft.legal_review);
  assert.equal(archiveObsoleteDrafts({...f.options,apply:true}).archived,0);
});
test("recent editions, recently edited drafts and already reviewed content are preserved", t => {
  const f=fixture(t);
  for(const change of [{generated_at:"2026-11-09T00:00:00Z"},{issue:{slug:"news/veille-assurance-immeuble-2026-11-09"}},{publication_status:"human_rejected"},{allowed_publication:true},{human_review_required:false},{issue:{slug:"other/2026-08-19"}}]) {
    const content=JSON.stringify({...f.draft,...change}); writeFileSync(f.path,content);
    assert.equal(archiveObsoleteDrafts({...f.options,apply:true}).archived,0);
    assert.equal(readFileSync(f.path,"utf8"),content);
  }
});
test("an absent, nested or conflicting backup and a recent cutoff cannot authorize archival", t => {
  const f=fixture(t);
  for(const backupRoot of [undefined,f.draftsRoot,join(f.draftsRoot,"backup")]) assert.throws(()=>archiveObsoleteDrafts({...f.options,backupRoot,apply:true}),/backup/);
  assert.throws(()=>archiveObsoleteDrafts({...f.options,before:"2026-11-01",apply:true}),/60 days/);
  mkdirSync(f.backupRoot); writeFileSync(join(f.backupRoot,"news-old.json"),"other content");
  assert.throws(()=>archiveObsoleteDrafts({...f.options,apply:true}),/does not match/);
  assert.equal(readFileSync(f.path,"utf8"),f.original);
});
