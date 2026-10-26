import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import { openLocalSqlite } from "./local-sqlite-db.js";
const temp = mkdtempSync(join(tmpdir(), "immeuble-questionnaire-browser-"));
const output = resolve(process.env.QUESTIONNAIRE_PREVIEW_ROOT || "C:/Users/PC/.cache/immeubleassur-entoria-review/questionnaire-preview");
mkdirSync(output, { recursive: true });
const port = 18000 + Math.floor(Math.random() * 1000), origin = `http://127.0.0.1:${port}`, adminToken = crypto.randomUUID();
const dbPath = join(temp, "fixture.sqlite"), DB = openLocalSqlite({ dbPath, schemaPath: "schema.sql" }), stamp = new Date().toISOString();
DB.prepare("INSERT INTO leads (id, reference, name, phone, email, profile, property_type, city, status, created_at, updated_at) VALUES ('browser-lead', 'IMB-TEST-BROWSER', 'Prospect de démonstration', '0600000000', 'prospect@example.test', 'syndic-benevole', 'mixte', 'Amiens', 'new', ?, ?)").bind(stamp, stamp).run();
DB.prepare("INSERT INTO brokerage_cases (id, lead_id, case_reference, client_portal_token, created_at, updated_at) VALUES ('browser-case', 'browser-lead', 'DOS-TEST-BROWSER', 'browser-test-portal-token-long-enough', ?, ?)").bind(stamp, stamp).run();
const server = spawn(process.execPath, ["scripts/local-production-server.js"], { cwd: process.cwd(), env: { ...process.env, LOCAL_SITE_HOST: "127.0.0.1", LOCAL_SITE_PORT: String(port), LOCAL_SQLITE_DB: dbPath, LOCAL_RUNTIME_ASSETS_ROOT: join(temp, "assets"), LOCAL_RUNTIME_REPORTS_ROOT: join(temp, "reports"), ADMIN_API_TOKEN: adminToken, DOCUMENT_ENCRYPTION_KEY: "34".repeat(32), DOCUMENT_ENCRYPTION_REQUIRED: "1", SITE_ORIGIN: origin, EMAIL_TRANSPORT: "smtp", RESEND_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", SMTP_FROM: "team@immeubleassur.com", SMTP_TO: "team@immeubleassur.com" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let logs = "", browser;
server.stdout.on("data", bytes => { logs += bytes.toString(); }); server.stderr.on("data", bytes => { logs += bytes.toString(); });
try {
  for (let attempt = 0; attempt < 50; attempt++) { try { if ((await fetch(origin + "/health")).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 200)); }
  const create = await fetch(origin + "/api/admin/questionnaires", { method: "POST", headers: { Authorization: "Bearer " + adminToken, "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", case_id: "browser-case", answers: { risk_address: "Adresse du dossier de démonstration", risk_postcode: "80000", risk_city: "Amiens", lots_count: 6, declared_surface: 350, declared_surface_basis: "unknown", use_type: "mixte" } }) });
  const invite = await create.json(); assert.ok(create.ok, JSON.stringify(invite));
  const executablePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].filter(Boolean).find(existsSync);
  assert.ok(executablePath, "Browser executable absent");
  browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--disable-gpu", "--disable-extensions"] });
  const page = await browser.newPage(), errors = [], external = [];
  page.on("pageerror", error => errors.push(error.message)); page.on("request", request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin + "/")) external.push(request.url()); });
  await page.setViewport({ width: 1440, height: 1050 }); await page.goto(invite.url, { waitUntil: "networkidle0" });
  await page.waitForSelector("#q-workspace:not([hidden])");
  assert.equal(new URL(page.url()).hash, "", "the access secret must disappear from the address bar");
  assert.equal(await page.$eval('[name="risk_city"]', element => element.value), "Amiens");
  await page.$eval('[name="residence_name"]', element => { element.value = "Résidence de démonstration"; element.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector("#q-save-state").textContent.startsWith("Enregistré"), { timeout: 15000 });
  await page.reload({ waitUntil: "networkidle0" }); await page.waitForSelector("#q-workspace:not([hidden])");
  assert.equal(await page.$eval('[name="residence_name"]', element => element.value), "Résidence de démonstration");
  await page.screenshot({ path: join(output, "desktop.png"), fullPage: true });
  await page.setViewport({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "mobile layout must not overflow");
  await page.screenshot({ path: join(output, "mobile.png"), fullPage: true });
  await page.$$eval("#q-navigation button", buttons => buttons.at(-1).click()); await page.click("#q-confirm"); await page.click("#q-submit");
  await page.waitForFunction(() => document.querySelector("#q-status").textContent.includes("Vos réponses ont été reçues"), { timeout: 60000 });
  assert.equal(await page.$$eval("#q-reports button", buttons => buttons.length), 3);
  const submission = DB.prepare("SELECT * FROM client_risk_submissions").first(); assert.equal(submission.state, "ready"); assert.equal(submission.notification_status, "failed", "the preview must not send real mail with empty SMTP settings");
  assert.equal(DB.prepare("SELECT COUNT(*) AS count FROM case_mail_queue WHERE audience = 'insurer' AND status = 'sent'").first().count, 0);
  await page.click("#q-lock"); assert.ok(await page.$eval("#q-workspace", element => element.hidden));
  assert.equal(await page.evaluate(() => sessionStorage.getItem("immeubleassur_questionnaire_access")), null);
  assert.deepEqual(errors, []); assert.deepEqual(external, [], "the private page must not contact third-party analytics or services");
  console.log(JSON.stringify({ passed: true, desktop: "1440px", mobile: "375px", auto_save: true, reload: true, report_downloads: 3, secret_removed_from_url: true, third_party_requests: 0, real_email_sent: false, previews: output }));
} catch (error) { console.error(logs.slice(-1500)); throw error; }
finally { await browser?.close(); server.kill(); await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); }); DB.close(); const safe = resolve(temp); assert.ok(safe.startsWith(resolve(tmpdir()) + sep)); rmSync(safe, { recursive: true, force: true }); }
