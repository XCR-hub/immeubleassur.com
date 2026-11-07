import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import * as chromeLauncher from 'chrome-launcher';
import {writeFileSync} from 'node:fs';
const origin='https://immeubleassur.com',id='G-EFZ4PY4GEZ';
const report={at:new Date().toISOString(),measurement_id:id,google_requests:[],lead_submissions:0};
let browser;
const collector=u=>/(^|\.)google-analytics\.com$/.test(u.hostname)&&u.pathname.endsWith('/collect');
function fields(request){const u=new URL(request.url());const b=new URLSearchParams((request.postData()||'').split('\n')[0]);const get=k=>u.searchParams.get(k)||b.get(k);return {measurement_id:get('tid'),event:get('en'),debug:get('_dbg')==='1'||get('ep.debug_mode')==='true'};}
try{
 const health=await(await fetch(origin+'/health')).json();report.revision=health.source_revision;
 assert.equal(health.source_revision,'0b6823f2f5b706f9c75ff406182073b9661c8572');
 for(const path of ['/admin','/espace-client','/espace-assureur','/questionnaire-immeuble','/merci']){
  const r=await fetch(origin+path);assert.ok(!(await r.text()).includes('ia-ga4-measurement-id'),path+' excludes Analytics');
 }
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||chromeLauncher.Launcher.getInstallations()[0],headless:true,args:['--no-first-run']});
 const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true});
 await page.evaluateOnNewDocument(()=>{window.dataLayer=[];window.gtag=function(){if(arguments[0]==='config'||arguments[0]==='event')arguments[2]={...arguments[2],debug_mode:true,traffic_type:'internal'};window.dataLayer.push(arguments)};});
 await page.setRequestInterception(true);
 page.on('request',request=>{const u=new URL(request.url());if(u.pathname.startsWith('/api/')){if(u.pathname==='/api/leads')report.lead_submissions++;void request.respond({status:200,contentType:'application/json',body:'{"success":true}'});return;}if(u.hostname==='www.googletagmanager.com'||collector(u))report.google_requests.push({host:u.hostname,path:u.pathname,...fields(request)});void request.continue();});
 page.on('response',response=>{if(collector(new URL(response.url())))report.collection_response={status:response.status(),...fields(response.request())};});
 await page.goto(origin,{waitUntil:'networkidle0',timeout:45000});
 assert.equal(await page.$eval('meta[name="ia-ga4-measurement-id"]',e=>e.content),id);
 assert.equal(report.google_requests.length,0,'No Google request before choice');
 await page.click('[data-analytics-choice="denied"]');await page.reload({waitUntil:'networkidle0'});
 assert.equal(report.google_requests.length,0,'No Google request after refusal');
 const receipt=page.waitForResponse(r=>collector(new URL(r.url()))&&fields(r.request()).measurement_id===id&&fields(r.request()).event==='page_view',{timeout:45000});
 await page.click('.analytics-settings');await page.click('[data-analytics-choice="granted"]');
 const response=await receipt;assert.ok([200,204].includes(response.status()));report.accepted_page_view_status=response.status();
 report.debug_event=await page.evaluate(()=>window.dataLayer.some(c=>c[0]==='event'&&c[1]==='page_view'&&c[2]?.debug_mode===true));assert.equal(report.debug_event,true);
 await page.click('.analytics-settings');await page.click('[data-analytics-choice="denied"]');
 const before=report.google_requests.filter(r=>r.event).length;await page.evaluate(()=>window.iaTrackAnalytics('cta_click'));await new Promise(r=>setTimeout(r,700));
 assert.equal(report.google_requests.filter(r=>r.event).length,before,'Withdrawal stops events');assert.equal(report.lead_submissions,0);report.success=true;
 console.log('Live GA4 verified: HTTP '+response.status()+' debug page_view; no collection before consent or after refusal; no lead submitted.');
}catch(e){report.success=false;report.error=e.message;process.exitCode=1;console.error(e.message);}
finally{writeFileSync('ga4-live-verification.json',JSON.stringify(report,null,2));if(browser)await browser.close();}
