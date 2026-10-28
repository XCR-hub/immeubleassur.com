import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const updater = resolve("scripts/update-local-production-checkout.ps1");

test("production checkout validates the configured runtime without modifying it", {
  skip: process.platform !== "win32",
  timeout: 90000
}, async (t) => {
  const root = mkdtempSync(join(tmpdir(), "immeubleassur checkout "));
  const site = join(root, "site");
  const reportPath = join(root, "deployment.json");
  mkdirSync(site);
  const gitPath = execFileSync("where.exe", ["git.exe"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
  const git = (...args) => execFileSync(gitPath, ["-C", site, ...args], { encoding: "utf8", windowsHide: true }).trim();
  git("init", "--initial-branch=main");
  copyFileSync(resolve(".gitignore"), join(site, ".gitignore"));
  writeFileSync(join(site, "README.txt"), "Production checkout fixture\n");
  git("add", ".");
  git("-c", "user.name=Checkout test", "-c", "user.email=checkout@example.invalid", "commit", "-m", "Fixture");
  const revision = git("rev-parse", "HEAD");
  let servedRevision = revision;
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    assert.equal(request.url, "/health");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ success: true, status: "ok", source_revision: servedRevision }));
  });
  t.after(() => {
    server.close();
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}\\immeubleassur checkout `));
    rmSync(root, { recursive: true, force: true });
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = server.address().port;
  const inheritedEnv = { ...process.env };
  for (const key of Object.keys(inheritedEnv)) {
    if (key.toUpperCase() === "LOCAL_SITE_PORT") delete inheritedEnv[key];
  }
  function validate({ extraArgs = [], env = {} } = {}) {
    return new Promise((resolveRun, rejectRun) => {
      const child = spawn("powershell.exe", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", updater,
        "-SiteRoot", site, "-GitPath", gitPath, "-ReportPath", reportPath,
        "-LockTimeoutSeconds", "5", "-ValidateOnly", ...extraArgs
      ], { env: { ...inheritedEnv, ...env }, windowsHide: true });
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.on("error", rejectRun);
      child.on("close", (code) => resolveRun({ code, output, report: JSON.parse(readFileSync(reportPath, "utf8")) }));
    });
  }
  function assertValidated(result) {
    assert.equal(result.code, 0, result.output);
    assert.equal(result.report.status, "validated");
    assert.equal(result.report.revision_before, revision);
    assert.equal(result.report.revision_after, revision);
    assert.equal(result.report.served_revision, revision);
    assert.equal(result.report.runtime_revision_verified, true);
    assert.equal(result.report.activation_attempted, false);
    assert.equal(result.report.editorial_refresh_attempted, false);
    assert.equal(git("rev-parse", "HEAD"), revision);
    assert.equal(JSON.stringify(result.report).includes(root), false);
  }

  await t.test("reads the quoted configured port with the server's file precedence", async () => {
    writeFileSync(join(site, ".env"), 'LOCAL_SITE_PORT=""\n');
    writeFileSync(join(site, ".env.local"), `PRIVATE_KEY=never-export-this\n# LOCAL_SITE_PORT=1\n LOCAL_SITE_PORT = "${port}"\n`);
    writeFileSync(join(site, ".env.production"), "LOCAL_SITE_PORT=1\n");
    const result = await validate();
    assertValidated(result);
    assert.equal(JSON.stringify(result).includes("never-export-this"), false);
  });
  await t.test("the inherited port takes precedence over env files", async () => {
    writeFileSync(join(site, ".env.local"), "LOCAL_SITE_PORT=invalid\n");
    assertValidated(await validate({ env: { LOCAL_SITE_PORT: String(port) } }));
  });
  await t.test("an explicit health origin overrides the configured port", async () => {
    assertValidated(await validate({ extraArgs: ["-HealthOrigin", `http://127.0.0.1:${port}/`] }));
  });
  await t.test("rejects invalid configured ports without disclosing their value", async () => {
    const before = requests;
    const result = await validate();
    assert.notEqual(result.code, 0);
    assert.match(result.report.error, /LOCAL_SITE_PORT must be an integer/);
    assert.equal(result.report.runtime_revision_verified, false);
    assert.equal(requests, before);
  });
  await t.test("a stale running revision is rejected", async () => {
    writeFileSync(join(site, ".env.local"), `LOCAL_SITE_PORT='${port}'\n`);
    servedRevision = "0".repeat(40);
    const result = await validate();
    assert.notEqual(result.code, 0);
    assert.equal(result.report.status, "failed");
    assert.equal(result.report.runtime_revision_verified, false);
    assert.match(result.report.error, /does not match checkout/);
    servedRevision = revision;
  });
  await t.test("a generated SMTP diagnostic does not block validation and is preserved", async () => {
    mkdirSync(join(site, "reports"));
    const diagnostic = join(site, "reports", "local-smtp-health-report.json");
    writeFileSync(diagnostic, '{"message_sent":false}\n');
    assert.equal(git("status", "--porcelain"), "");
    assertValidated(await validate());
    assert.equal(existsSync(diagnostic), true);
    assert.equal(readFileSync(diagnostic, "utf8"), '{"message_sent":false}\n');
  });
  await t.test("real uncommitted changes still prevent validation", async () => {
    writeFileSync(join(site, "README.txt"), "Uncommitted change\n");
    const before = requests;
    const result = await validate();
    assert.notEqual(result.code, 0);
    assert.match(result.report.error, /uncommitted changes/);
    assert.equal(requests, before);
    assert.equal(git("rev-parse", "HEAD"), revision);
  });
});
