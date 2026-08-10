import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REPORT_PATH = join("reports", "security-headers-report.json");
const ASSET_PATH = join("public", "assets", "security-headers-latest.json");
const serverFiles = ["scripts/local-production-server.js", "scripts/local-static-server.js"];
const requiredHeaders = ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "X-Permitted-Cross-Domain-Policies", "Permissions-Policy", "Cross-Origin-Opener-Policy", "Cross-Origin-Resource-Policy"];
const requiredCspDirectives = ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'", "form-action 'self'", "script-src 'self' https://challenges.cloudflare.com https://www.googletagmanager.com", "connect-src 'self' https://challenges.cloudflare.com https://region1.google-analytics.com https://www.google-analytics.com", "frame-src https://challenges.cloudflare.com", "upgrade-insecure-requests"];
const securityTxtRequirements = ["Contact: mailto:team@immeubleassur.com", "Expires:", "Preferred-Languages:", "Canonical: https://immeubleassur.com/.well-known/security.txt", "Policy: https://immeubleassur.com/confidentialite"];

function ensureDir(path) { mkdirSync(path, { recursive: true }); }
function writeJson(path, value) { ensureDir(dirname(path)); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function read(path) { return existsSync(path) ? readFileSync(path, "utf8") : ""; }
function addIssue(issues, file, rule, message) { issues.push({ severity: "high", file, rule, message }); }

const issues = [];
const fileReports = serverFiles.map((file) => {
  const text = read(file);
  const missingHeaders = requiredHeaders.filter((header) => !text.includes(header));
  const missingDirectives = requiredCspDirectives.filter((directive) => !text.includes(directive));
  if (!text) addIssue(issues, file, "missing-file", `${file} absent.`);
  if (!text.includes("runtime-security-headers-v1")) addIssue(issues, file, "missing-marker", "Marqueur runtime security headers absent.");
  if (!text.includes("applySecurityHeaders(response, request)")) addIssue(issues, file, "not-applied", "Les headers ne sont pas appliques au debut de chaque requete.");
  for (const header of missingHeaders) addIssue(issues, file, "missing-header", `${header} absent.`);
  for (const directive of missingDirectives) addIssue(issues, file, "missing-csp-directive", `${directive} absent.`);
  return {
    file,
    marker: text.includes("runtime-security-headers-v1"),
    applied_to_requests: text.includes("applySecurityHeaders(response, request)"),
    headers_present: requiredHeaders.filter((header) => text.includes(header)),
    csp_directives_present: requiredCspDirectives.filter((directive) => text.includes(directive))
  };
});

const securityTxtPath = join("public", ".well-known", "security.txt");
const securityTxt = read(securityTxtPath);
if (!securityTxt) addIssue(issues, securityTxtPath, "missing-security-txt", "security.txt absent.");
for (const requirement of securityTxtRequirements) if (!securityTxt.includes(requirement)) addIssue(issues, securityTxtPath, "security-txt-field", `${requirement} absent.`);
const analyticsGenerator = read("scripts/seo-growth-pass.js");
const ga4Client = read(join("public", "assets", "ga4-init.js"));
if (!analyticsGenerator.includes('meta name="ia-ga4-measurement-id"') || analyticsGenerator.includes("<script>window.dataLayer")) addIssue(issues, "scripts/seo-growth-pass.js", "inline-ga4-bootstrap", "GA4 bootstrap must remain external to satisfy strict CSP.");
if (!ga4Client.includes("function initializeGa4()") || !ga4Client.includes('meta[name="ia-ga4-measurement-id"]')) addIssue(issues, "public/assets/ga4-init.js", "missing-external-ga4-bootstrap", "External GA4 bootstrap missing.");
const adminHtml = read(join("public", "admin.html"));
const adminProfile = read(join("public", "assets", "admin-profile.js"));
const adminNoStore = serverFiles.every((file) => {
  const server = read(file);
  return server.includes('"Cache-Control"') && server.includes('file.endsWith(join("public", "admin.html"))') && server.includes('"no-store"');
});
for (const [rule, ok, message] of [
  ["admin-no-referrer", adminHtml.includes('name="referrer" content="no-referrer"'), "Admin referrer policy missing."],
  ["invite-url-scrubbed", adminProfile.includes('history.replaceState(null, "", window.location.pathname + window.location.hash)'), "Invitation token remains in browser URL."],
  ["admin-no-store", adminNoStore, "Admin HTML is publicly cacheable."]
]) if (!ok) addIssue(issues, "admin-security", rule, message);
const packageText = read("package.json");
if (!packageText.includes("security:headers")) addIssue(issues, "package.json", "missing-script", "Script security:headers absent.");
if (!packageText.includes("security-headers-check.js")) addIssue(issues, "package.json", "missing-check", "security-headers-check.js absent des controles npm.");

const report = {
  generated_at: new Date().toISOString(),
  status: issues.length ? "failed" : "passed",
  header_count: requiredHeaders.length,
  csp_directive_count: requiredCspDirectives.length,
  files_checked: fileReports.length,
  security_txt: Boolean(securityTxt),
  files: fileReports,
  issue_count: issues.length,
  issues,
  safeguards: ["centralized-runtime-security-headers", "csp-allows-turnstile-and-ga4-only", "ga4-bootstrap-external-to-strict-csp", "hsts-behind-https-proxy", "frame-ancestors-none", "cross-origin-resource-policy", "admin-no-store", "invite-url-scrubbing", "security-txt-contact"]
};

writeJson(REPORT_PATH, report);
writeJson(ASSET_PATH, report);
if (issues.length) {
  console.error(`Security headers contract failed: ${issues.length} issue(s).`);
  for (const item of issues.slice(0, 12)) console.error(`${item.file}: ${item.rule} - ${item.message}`);
  process.exit(1);
}
console.log(`Security headers contract passed: ${requiredHeaders.length} header(s), ${requiredCspDirectives.length} CSP directive(s).`);