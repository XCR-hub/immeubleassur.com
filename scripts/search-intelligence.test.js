import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const script=resolve("scripts/search-intelligence.js");
function fixture(t) {
  const parent=realpathSync(tmpdir()); const root=mkdtempSync(join(parent,"immeubleassur-serp-test-"));
  t.after(()=>{const checked=relative(parent,realpathSync(root));assert.ok(!checked.startsWith("..")&&basename(root).startsWith("immeubleassur-serp-test-"));rmSync(root,{recursive:true,force:true});});
  const mock=join(root,"network.mjs"); const callsPath=join(root,"calls.jsonl");
  writeFileSync(mock,`import {appendFileSync} from 'node:fs';
    globalThis.fetch=async(value)=>{const url=new URL(value);appendFileSync(process.env.MOCK_CALLS,JSON.stringify({path:url.pathname,q:url.searchParams.get('q')})+'\\n');
      if(url.pathname==='/account.json') return new Response(JSON.stringify({total_searches_left:Number(process.env.MOCK_QUOTA),searches_per_month:250,this_month_usage:250-Number(process.env.MOCK_QUOTA),plan_renewal_date:'2026-12-01',api_key:process.env.SERP_API_KEY,account_email:'private@example.test'}),{status:Number(process.env.MOCK_ACCOUNT_STATUS)});
      if(url.pathname!=='/search.json') throw new Error('Unexpected endpoint');
      return new Response(JSON.stringify(process.env.MOCK_SEARCH_ERROR==='1'?{error:'provider failure'}:{search_metadata:{status:'Success',id:'measured-fixture'},organic_results:[{position:9,link:'https://immeubleassur.com/assurance-immeuble',title:'Fixture'}]}),{status:Number(process.env.MOCK_SEARCH_STATUS)});
    };`);
  const run=(extra={},flags=['--serp','--max-requests=1','--rotate'])=>{
    const result=spawnSync(process.execPath,['--import',pathToFileURL(mock).href,script,...flags],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,SERP_API_KEY:'fixture-secret-never-export',LOCAL_RUNTIME_REPORTS_ROOT:join(root,'reports'),LOCAL_RUNTIME_ASSETS_ROOT:join(root,'runtime'),MOCK_CALLS:callsPath,MOCK_QUOTA:'2',MOCK_ACCOUNT_STATUS:'200',MOCK_SEARCH_STATUS:'200',MOCK_SEARCH_ERROR:'0',...extra}});
    assert.equal(result.status,0,result.stderr); const report=JSON.parse(readFileSync(join(root,'reports','search-intelligence-report.json'),'utf8'));
    assert.equal(JSON.stringify(report).includes('fixture-secret-never-export'),false);assert.equal(JSON.stringify(report).includes('private@example.test'),false);
    return report;
  };
  const calls=()=>existsSync(callsPath)?readFileSync(callsPath,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)):[];
  return {run,calls};
}
test('exhausted quotas are checked without making a search or inventing a measurement',t=>{
  const f=fixture(t);const report=f.run({MOCK_QUOTA:'0'});
  assert.equal(report.status,'serpapi-quota-exhausted');assert.equal(report.serp_request_count,0);assert.equal(report.measured_count,0);
  assert.equal(report.account_quota.remaining_searches,0);assert.equal(report.account_quota.renewal_date,'2026-12-01');
  assert.equal(f.calls().filter(call=>call.path==='/search.json').length,0);assert.ok(report.rankings.every(row=>row.actionable===false&&row.recommendation===null));
});
test('search budgets rotate real queries and leave deferred results non-actionable',t=>{
  const f=fixture(t);const first=f.run();const second=f.run();
  assert.equal(first.measured_count,1);assert.equal(second.measured_count,1);assert.equal(first.serp_request_count,1);
  const searches=f.calls().filter(call=>call.path==='/search.json');assert.equal(searches.length,2);assert.notEqual(searches[0].q,searches[1].q);
  assert.equal(first.budget_deferred_count,10);assert.ok(first.rankings.filter(row=>!row.measured).every(row=>row.actionable===false&&row.recommendation===null));
});
test('account failures and invalid budgets cannot start paid searches',t=>{
  const f=fixture(t);assert.equal(f.run({MOCK_ACCOUNT_STATUS:'503'}).status,'serpapi-account-unavailable');
  assert.equal(f.run({},['--serp','--max-requests=invalid']).serp_request_count,0);
  assert.equal(f.calls().filter(call=>call.path==='/search.json').length,0);
});
test('the remaining quota and the first rate limit bound all searches in a batch',t=>{
  const f=fixture(t);assert.equal(f.run({MOCK_QUOTA:'1'},['--serp','--max-requests=5']).serp_request_count,1);
  const limited=f.run({MOCK_SEARCH_STATUS:'429'},['--serp','--max-requests=5']);
  assert.equal(limited.serp_request_count,1);assert.equal(limited.rate_limited,true);assert.equal(limited.measured_count,0);
});
test('a provider error inside an HTTP 200 response never becomes a measured position',t=>{
  const f=fixture(t);const report=f.run({MOCK_SEARCH_ERROR:'1'});
  assert.equal(report.measured_count,0);assert.equal(report.status,'serpapi-unavailable-fallback');assert.ok(report.rankings.every(row=>row.actionable===false));
});
