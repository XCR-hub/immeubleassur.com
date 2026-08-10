import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
loadDefaultEnvFiles();
const origin=String(env("SITE_ORIGIN","https://immeubleassur.com")).replace(/\/+$/,"");
const out=resolve(env("LOCAL_SECURITY_SURFACE_REPORT",join(env("LOCAL_RUNTIME_REPORTS_ROOT","reports"),"local-security-surface-report.json")));
const checks=[];
const add=(name,ok,details={})=>checks.push({name,ok:Boolean(ok),...details});
async function probe(path,options={}){try{const response=await fetch(origin+path,{...options,signal:AbortSignal.timeout(12000),headers:{"User-Agent":"ImmeubleAssurSecurityMonitor/1.0",...(options.headers||{})}});const text=await response.text();return{response,text};}catch(error){return{response:null,text:"",error:error.message||"request failed"};}}
const home=await probe("/");
const h=home.response?.headers;
const csp=h?.get("content-security-policy")||"";
const scriptPolicy=csp.split(";").map((part)=>part.trim()).find((part)=>part.startsWith("script-src "))||"";
const hstsOk = origin.startsWith("https://") ? h?.get("strict-transport-security")?.includes("max-age=31536000") : true;
add("homepage-security-headers",home.response?.status===200&&Boolean(h?.get("content-security-policy"))&&hstsOk&&h?.get("x-content-type-options")==="nosniff"&&h?.get("x-frame-options")==="DENY"&&h?.get("permissions-policy")?.includes("camera=()")&&h?.get("cross-origin-opener-policy")==="same-origin"&&h?.get("cross-origin-resource-policy")==="same-origin",{status:home.response?.status||0});
add("csp-blocks-inline-executable-scripts",Boolean(scriptPolicy)&&!scriptPolicy.includes("'unsafe-inline'"),{script_policy:scriptPolicy});
const admin=await probe("/admin.html");
add("admin-no-store",admin.response?.status===200&&admin.response.headers.get("cache-control")?.includes("no-store"),{status:admin.response?.status||0,cache_control:admin.response?.headers.get("cache-control")||""});
add("admin-no-referrer",admin.response?.headers.get("referrer-policy")==="no-referrer"&&admin.text.includes('name="referrer" content="no-referrer"'),{referrer_policy:admin.response?.headers.get("referrer-policy")||""});
add("admin-noindex",admin.text.includes('name="robots" content="noindex, nofollow"'));
const profile=await probe("/assets/admin-profile.js");
add("invite-token-url-scrub",profile.response?.status===200&&profile.text.includes("history.replaceState")&&profile.text.includes("window.location.pathname"),{status:profile.response?.status||0});
for(const path of ["/api/admin/leads","/api/admin/runtime-health","/api/admin/auth?events=1"]){const result=await probe(path);add(`anonymous-denied:${path}`,result.response?.status===401&&!/token|password_hash|password_salt|smtp_pass|api_key/i.test(result.text),{status:result.response?.status||0,cache_control:result.response?.headers.get("cache-control")||""});}
const leads=await probe("/api/leads"); add("lead-api-method-closed",leads.response?.status===405,{status:leads.response?.status||0});
const health=await probe("/health"); add("health-minimal",health.response?.status===200&&/"success":true/.test(health.text)&&!/token|password|secret|smtp|api_key|[a-z]:\\\\|\\\\users\\\\/i.test(health.text),{status:health.response?.status||0,bytes:health.text.length});
const securityTxt=await probe("/.well-known/security.txt"); add("security-txt",securityTxt.response?.status===200&&securityTxt.text.includes("mailto:team@immeubleassur.com")&&securityTxt.text.includes("Canonical:"),{status:securityTxt.response?.status||0});
const failed=checks.filter((row)=>!row.ok);
const report={generated_at:new Date().toISOString(),status:failed.length?"failed":"passed",success:failed.length===0,origin,checks,summary:{ok:checks.length-failed.length,failed:failed.length},safeguards:["live-header-verification","csp-inline-script-blocking","admin-no-store","admin-no-referrer","anonymous-admin-denial","minimal-health-response","security-contact"]};
mkdirSync(dirname(out),{recursive:true}); writeFileSync(out,`${JSON.stringify(report,null,2)}\n`,`utf8`); console.log(`Security surface monitor: ${report.status} (${report.summary.ok}/${checks.length}).`); if(failed.length)process.exitCode=1;