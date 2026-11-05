import assert from 'node:assert/strict';
import {test} from 'node:test';
import {sendGa4Event} from '../functions/_shared/ga4.js';
test('Google collection requires analytics consent and never duplicates browser collection', async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,status:204}};
 const env={GA4_MEASUREMENT_ID:'G-TEST123456',GA4_API_SECRET:'fixture-not-a-real-secret'};
 try{
  const base={env,eventName:'generate_lead',payload:{session_id:'fixture-session'}};
  const absent=await sendGa4Event(base);assert.match(absent.skipped,/consent/);assert.equal(calls.length,0);
  await sendGa4Event({...base,payload:{...base.payload,consent:true}});assert.equal(calls.length,0,'Contact consent is not audience-measurement consent');
  await sendGa4Event({...base,payload:{...base.payload,analytics_consent:true,analytics_transport:'browser'}});assert.equal(calls.length,0);
  await sendGa4Event({...base,payload:{...base.payload,analytics_consent:true},params:{name:'never-send-name',email:'never-send-email',message:'never-send-message'}});
  assert.equal(calls.length,1);assert.equal(calls[0].body.events[0].name,'generate_lead');
  assert.ok(!JSON.stringify(calls[0].body).includes('never-send-'));
 }finally{globalThis.fetch=original}
});
