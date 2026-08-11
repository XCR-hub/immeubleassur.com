import { googleSiteVerificationBody, normalizeGoogleSiteVerificationFile } from "./google-site-verification.js";

const valid = "google12345678abcdef.html";
const checks = [
  ["valid-file-accepted", normalizeGoogleSiteVerificationFile(valid) === valid],
  ["exact-path-served", googleSiteVerificationBody(`/${valid}`, valid) === `google-site-verification: ${valid}`],
  ["other-token-refused", googleSiteVerificationBody("/google87654321.html", valid) === ""],
  ["path-traversal-refused", normalizeGoogleSiteVerificationFile("../google12345678.html") === ""],
  ["wrong-extension-refused", normalizeGoogleSiteVerificationFile("google12345678.txt") === ""],
  ["short-token-refused", normalizeGoogleSiteVerificationFile("google123.html") === ""],
  ["unconfigured-path-refused", googleSiteVerificationBody(`/${valid}`, "") === ""]
];

const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Google site verification contract: ${missing.length ? "failed" : "passed"} (${checks.length - missing.length}/${checks.length}).`);
if (missing.length) { console.error(missing.join(", ")); process.exitCode = 1; }
