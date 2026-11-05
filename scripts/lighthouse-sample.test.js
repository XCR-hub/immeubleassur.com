import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runLighthouseSample} from './lighthouse-sample.js';
test('a thrown navigation trace failure is retried once', async()=>{
 let calls=0; const expected={lhr:{categories:{performance:{score:.85}}}};
 const r=await runLighthouseSample(async()=>{if(++calls===1)throw new Error('NO_NAVSTART: trace missing');return expected},{retryDelayMs:0});
 assert.equal(calls,2);assert.equal(r.result,expected);assert.equal(r.attempts,2);
});
test('a returned navigation failure is also retried',async()=>{
 let calls=0;const expected={lhr:{categories:{}}};
 const r=await runLighthouseSample(async()=>++calls===1?{lhr:{runtimeError:{code:'NO_NAVSTART'}}}:expected,{retryDelayMs:0});
 assert.equal(calls,2);assert.equal(r.result,expected);
});
test('genuine audit failures remain visible without repeated runs',async()=>{
 let calls=0;const error=new Error('CHROME_INTERSTITIAL_ERROR');
 await assert.rejects(runLighthouseSample(async()=>{calls++;throw error},{retryDelayMs:0}),e=>e===error);
 assert.equal(calls,1);
});
test('repeated navigation failures stop after two attempts',async()=>{
 let calls=0;await assert.rejects(runLighthouseSample(async()=>{calls++;throw new Error('NO_NAVSTART')},{retryDelayMs:0}),/NO_NAVSTART/);
 assert.equal(calls,2);
});
test('a successful sample needs a single audit',async()=>{
 let calls=0;const r=await runLighthouseSample(async()=>{calls++;return {lhr:{}}});
 assert.equal(calls,1);assert.equal(r.attempts,1);
});
