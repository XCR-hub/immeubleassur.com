import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import{writeFileSync,mkdirSync}from'node:fs';import{createServer}from'node:net';
import {resolve,dirname}from'node:path';import puppeteer from 'puppeteer-core';import * as chromeLauncher from 'chrome-launcher';
const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const origin='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['scripts/local-static-server.js'],{cwd:resolve('.'),env:{...process.env,HOST:'127.0.0.1',PORT:String(port)},windowsHide:true,stdio:'ignore'});
let browser;const googleRequests=[];const errors=[];
try{for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||chromeLauncher.Launcher.getInstallations()[0],headless:true,args:['--no-first-run']});
 async function open(path){
  const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true});
  page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
  page.on('request',request=>{
   const u=new URL(request.url());
   if(request.isNavigationRequest())void request.respond({status:200,contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Analytics fixture</title><meta name="ia-ga4-measurement-id" content="G-TEST123456"><link rel="stylesheet" href="/assets/styles.css"><script defer src="/assets/ga4-init.js"></script></head><body><main><h1>Analytics fixture</h1></main><footer class="site-footer"></footer></body></html>'});
   else if(u.hostname==='www.googletagmanager.com'){googleRequests.push(u.pathname);void request.respond({status:200,contentType:'text/javascript',body:'/* Google is stubbed: no data is transmitted. */'});}
   else if(u.origin!==origin||u.pathname.startsWith('/api/'))void request.abort();
   else void request.continue();
  });await page.goto(origin+path,{waitUntil:'networkidle0'});return page;
 }
 const page=await open('/?email=never-send-email#token=never-send-token');
 assert.equal(googleRequests.length,0);
 assert.equal(await page.evaluate(()=>window.iaAnalyticsState().granted),false);
 await page.click('[data-analytics-choice="denied"]');
 assert.equal(googleRequests.length,0);
 await page.reload({waitUntil:'networkidle0'});
 assert.equal(await page.$eval('.analytics-choice',e=>e.hidden),true);
 assert.equal(googleRequests.length,0);
 await page.click('.analytics-settings');await page.click('[data-analytics-choice="granted"]');
 await page.waitForFunction(()=>document.querySelector('script[data-ia-ga4]'));
 await new Promise(r=>setTimeout(r,250));
 assert.equal(googleRequests.length,1);
 const commands=await page.evaluate(()=>{
   window.iaTrackAnalytics('lead_created',{name:'never-send-name',email:'never-send-email',message:'never-send-message',lead_need:'multirisque-immeuble'});
   window.iaTrackAnalytics('page_view');
   return window.dataLayer.map(item=>Array.from(item));
 });
 assert.equal(commands.filter(c=>c[0]==='event'&&c[1]==='page_view').length,1);
 assert.equal(commands.filter(c=>c[0]==='event'&&c[1]==='generate_lead').length,1);
 assert.ok(!JSON.stringify(commands).includes('never-send-'));
 await page.evaluate(()=>{document.cookie='_ga=fixture; Path=/';});
 await page.click('.analytics-settings');await page.click('[data-analytics-choice="denied"]');
 const revoked=await page.evaluate(()=>{
  const before=window.dataLayer.length;window.iaTrackAnalytics('lead_created');
  return {disabled:window['ga-disable-G-TEST123456'],same:before===window.dataLayer.length,cookie:document.cookie};
 });
 assert.equal(revoked.disabled,true);assert.equal(revoked.same,true);assert.ok(!revoked.cookie.includes('_ga='));
 await page.evaluate(()=>localStorage.setItem('immeubleassur_analytics_choice_v1',JSON.stringify({value:'granted',at:Date.now(),measurementId:'G-TEST123456'})));
 for(const path of ['/admin','/admin-profile.html','/espace-client.html#token=fixture','/espace-assureur.html#token=fixture','/questionnaire-immeuble.html#token=fixture']){
   const privatePage=await open(path);
   assert.equal(await privatePage.evaluate(()=>typeof window.iaAnalyticsState),'undefined');
   assert.equal(googleRequests.length,1,'Private spaces must never load Google tags');await privatePage.close();
 }
 await page.evaluate(()=>localStorage.setItem('immeubleassur_analytics_choice_v1',JSON.stringify({value:'granted',at:Date.now()-181*86400000,measurementId:'G-TEST123456'})));
 const expired=await open('/');assert.equal(await expired.$eval('.analytics-choice',e=>e.hidden),false);assert.equal(googleRequests.length,1);
 assert.deepEqual(errors,[]);
 const out=resolve(process.env.LOCAL_GA4_CONSENT_REPORT||'reports/ga4-consent-browser-report.json');mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify({generated_at:new Date().toISOString(),success:true,scenarios:['no-request-before-choice','refusal-persists','single-page-view-after-acceptance','lead-event-without-personal-data','withdrawal-stops-collection','private-spaces-excluded','choice-expires'],real_google_requests:0,lead_submissions:0},null,2));
 console.log('GA4 consent browser passed: 7 scenarios, no real Google collection or lead submission.');
}finally{if(browser)await browser.close();child.kill()}
