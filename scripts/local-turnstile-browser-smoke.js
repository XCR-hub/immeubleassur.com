import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import * as chromeLauncher from "chrome-launcher";
import { loadDefaultEnvFiles, env } from "./local-env.js";

loadDefaultEnvFiles();

const site = env("SITE_ORIGIN", "https://immeubleassur.com").replace(/\/$/, "");
const reportDir = process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports";
const reportPath = resolve(env("LOCAL_TURNSTILE_BROWSER_REPORT", join(reportDir, "local-turnstile-browser-smoke-report.json")));
const chromePath = env("CHROME_PATH", "") || chromeLauncher.Launcher.getInstallations()[0];
const scenarios = [
  { name: "lead", selector: "#lead-form input[name='name']" },
  { name: "newsletter", selector: ".newsletter-form input[name='email']" }
];

function writeReport(report) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage();
  const requests = [];
  const failures = [];
  page.on("request", (request) => requests.push({ url: request.url(), method: request.method(), resource_type: request.resourceType() }));
  page.on("requestfailed", (request) => failures.push({ url: request.url(), error: request.failure()?.errorText || "request-failed" }));
  try {
    await page.goto(`${site}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForSelector(scenario.selector, { timeout: 15000 });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1200));
    const before = await page.evaluate(() => ({
      script: Boolean(document.querySelector("script[data-turnstile-on-demand]")),
      iframe: Boolean(document.querySelector(".cf-turnstile iframe")),
      api: Boolean(window.turnstile)
    }));
    const turnstileRequestsBefore = requests.filter((item) => item.url.includes("challenges.cloudflare.com/turnstile/"));
    await page.focus(scenario.selector);
    await page.waitForFunction(() => Boolean(document.querySelector("script[data-turnstile-on-demand]") && window.turnstile?.render), { timeout: 20000 });
    await page.waitForFunction(() => Boolean(document.querySelector(".cf-turnstile[data-dynamic-rendered='1']")), { timeout: 10000 });
    const after = await page.evaluate(() => ({
      script: document.querySelector("script[data-turnstile-on-demand]")?.getAttribute("src") || "",
      iframe_count: document.querySelectorAll(".cf-turnstile iframe").length,
      dynamic_widget_count: document.querySelectorAll(".cf-turnstile[data-dynamic-rendered='1']").length,
      api: Boolean(window.turnstile?.render),
      protected_forms: document.querySelectorAll("form .cf-turnstile[data-sitekey]").length
    }));
    const leadPosts = requests.filter((item) => item.method === "POST" && /\/api\/(leads|newsletter)(?:\?|$)/.test(item.url));
    const turnstileRequestsAfter = requests.filter((item) => item.url.includes("challenges.cloudflare.com/turnstile/"));
    const relevantFailures = failures.filter((item) => item.url.includes("challenges.cloudflare.com/turnstile/v0/api.js"));
    const challengeFailures = failures.filter((item) => item.url.includes(".challenges.cloudflare.com/cdn-cgi/challenge-platform/"));
    const checks = {
      absent_before_interaction: !before.script && !before.iframe && !before.api && turnstileRequestsBefore.length === 0,
      explicit_api_loaded: after.api && after.script.includes("turnstile/v0/api.js?render=explicit"),
      widget_rendered: after.dynamic_widget_count > 0 && after.protected_forms > 0,
      no_form_submission: leadPosts.length === 0,
      api_request_succeeded: relevantFailures.length === 0 && turnstileRequestsAfter.length > 0
    };
    return { name: scenario.name, ok: Object.values(checks).every(Boolean), network_ok: challengeFailures.length === 0, checks, before, after, turnstile_request_count: turnstileRequestsAfter.length, form_post_count: leadPosts.length, relevant_failures: relevantFailures, challenge_failures: challengeFailures };
  } catch (error) {
    return { name: scenario.name, ok: false, error: String(error.message || error).slice(0, 500), checks: {}, relevant_failures: failures.filter((item) => item.url.includes("challenges.cloudflare.com")) };
  } finally {
    await page.close();
  }
}

async function run() {
  if (!chromePath) throw new Error("Chrome ou Chromium introuvable");
  const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check"] });
  let rows;
  try {
    rows = [];
    for (const scenario of scenarios) rows.push(await runScenario(browser, scenario));
  } finally {
    await browser.close();
  }
  const coreHealthy = rows.every((row) => row.ok);
  const networkHealthy = rows.every((row) => row.network_ok !== false);
  const report = {
    generated_at: new Date().toISOString(),
    status: !coreHealthy ? "failed" : networkHealthy ? "healthy" : "degraded",
    site,
    chrome_path: chromePath,
    destructive: false,
    submitted_forms: 0,
    scenarios_checked: rows.length,
    scenarios_passed: rows.filter((row) => row.ok).length,
    rows,
    safeguards: ["no-lead-created", "no-newsletter-created", "turnstile-absent-before-interaction", "turnstile-present-after-interaction"]
  };
  writeReport(report);
  console.log(`Turnstile browser smoke ${report.status}: ${report.scenarios_passed}/${report.scenarios_checked} scenarios, 0 form submission.`);
  if (report.status === "failed") process.exitCode = 1;
}

run().catch((error) => {
  const report = { generated_at: new Date().toISOString(), status: "failed", site, destructive: false, submitted_forms: 0, error: String(error.message || error).slice(0, 500) };
  writeReport(report);
  console.error(`Turnstile browser smoke failed: ${report.error}`);
  process.exit(1);
});
