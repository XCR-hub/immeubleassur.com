import assert from 'node:assert/strict';import{test}from'node:test';
import {analyticsMeasurementId,analyticsTagBlock}from'./analytics-config.js';
test('the verified measurement ID belongs to this site configuration',()=>{
 assert.equal(analyticsMeasurementId(),'G-EFZ4PY4GEZ');
 assert.equal(analyticsMeasurementId({site_origin:'https://sciassur.com',measurement_id:'G-OTHER'}),'');
 assert.equal(analyticsMeasurementId({site_origin:'https://immeubleassur.com',measurement_id:'bad-id'}),'');
});
test('public pages get the opt-in bootstrap and private pages remain excluded',()=>{
 const block=analyticsTagBlock('assurance-immeuble');
 assert.match(block,/G-EFZ4PY4GEZ/);assert.match(block,/ga4-init.js/);
 assert.ok(!block.includes('googletagmanager.com'));
 for(const path of ['admin','admin-profile.html','espace-client','espace-assureur','questionnaire-immeuble','merci'])
   assert.equal(analyticsTagBlock(path),'',path);
});
