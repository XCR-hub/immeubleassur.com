import assert from 'node:assert/strict';
import {test} from 'node:test';
import {collectSearchTraffic, readSubmittedSitemap} from './google-search-traffic.js';
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
