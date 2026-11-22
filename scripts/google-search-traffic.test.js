import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectSearchTraffic, collectSearchPages, readSubmittedSitemap} from './google-search-traffic.js';
const base = {headers:{},siteUrl:'https://immeubleassur.com/',startDate:'2026-10-05',endDate:'2026-11-02'};
test('property totals do not hide visits when query-level rows are anonymized',async()=>{
 let body;
 const r=await collectSearchTraffic({...base,fetcher:async(url,options)=>{body=JSON.parse(options.body);return {ok:true,status:200,json:async()=>({rows:[{clicks:5,impressions:100,ctr:.05,position:12}]})}}});
 assert.deepEqual(body.dimensions,[]);assert.equal(body.aggregationType,'byProperty');
 assert.equal(r.status,'measured');assert.equal(r.clicks,5);assert.equal(r.impressions,100);
});
test('successful zero traffic is distinct from a missing connection and an API failure',async()=>{
 const r=await collectSearchTraffic({...base,fetcher:async()=>({ok:true,status:200,json:async()=>({rows:[]})})});
 assert.equal(r.status,'zero-traffic');assert.equal(r.position,null);assert.equal(r.start_date,base.startDate);
 const failed=await collectSearchTraffic({...base,fetcher:async()=>({ok:false,status:403})});
 assert.equal(failed.status,'failed');assert.equal(failed.impressions,undefined);
});
test('monitoring recognizes a sitemap already submitted without submitting it again',async()=>{
 let calls=0;
 const r=await readSubmittedSitemap({...base,sitemapUrl:'https://immeubleassur.com/sitemap.xml',fetcher:async(url,options)=>{
 calls++;assert.equal(options.method,undefined);return {ok:true,status:200,json:async()=>({sitemap:[{path:'https://immeubleassur.com/sitemap.xml',lastDownloaded:'2026-11-03',errors:'0',warnings:'0'}]})}}});
 assert.equal(calls,1);assert.equal(r.status,'submitted');assert.equal(r.errors,0);
});


test("page reporting preserves page aggregation and returns the most visible pages first",async()=>{
 let body;
 const result=await collectSearchPages({...base,fetcher:async(url,options)=>{
  body=JSON.parse(options.body);assert.ok(options.signal);
  return {ok:true,status:200,json:async()=>({responseAggregationType:"byPage",rows:[
   {keys:["https://immeubleassur.com/assurance-sci"],impressions:3,clicks:0,ctr:0,position:7},
   {keys:["https://immeubleassur.com/"],impressions:28,clicks:0,ctr:0,position:35.57}
  ]})};
 }});
 assert.deepEqual(body.dimensions,["page"]);assert.equal(body.aggregationType,"auto");assert.equal(body.rowLimit,2500);
 assert.equal(result.status,"measured");assert.equal(result.page_count,2);assert.equal(result.rows[0].impressions,28);
 assert.equal(result.aggregation_type,"byPage");assert.equal(result.impressions,undefined);assert.equal(result.row_limit_reached,false);
});

test("empty page rows are distinct from zero site traffic or an exhaustive indexation count",async()=>{
 const result=await collectSearchPages({...base,fetcher:async()=>({ok:true,status:200,json:async()=>({})})});
 assert.equal(result.status,"no-pages-reported");assert.equal(result.page_count,0);
 assert.equal(result.scope,"top-pages-reported-by-search-console");assert.equal(result.impressions,undefined);
});

test("optional page reporting isolates HTTP and network failures from the primary totals",async()=>{
 const denied=await collectSearchPages({...base,fetcher:async()=>({ok:false,status:403})});
 assert.equal(denied.status,"failed");assert.equal(denied.http_status,403);assert.equal(denied.rows,undefined);
 const network=await collectSearchPages({...base,fetcher:async()=>{throw Error("private request details")}});
 assert.equal(network.status,"failed");assert.equal(network.reason,"request-failed");
 assert.ok(!JSON.stringify(network).includes("private request details"));
});
