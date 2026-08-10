import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { sendNodeSmtpMail } from "./local-smtp.js";

loadDefaultEnvFiles();
const arg = (name, fallback = "") => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] || fallback; };
const clean = (value, max = 500) => String(value || "").trim().slice(0, max);
const hash = (value) => createHash("sha256").update(value || "").digest("hex");
const parseRecipients = (value) => String(value || "").split(/[;,]/).map((row) => row.trim()).filter(Boolean);
const htmlText = (html) => String(html || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const dbPath = resolve(arg("--db", env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"))));
const publicationsRoot = resolve(env("LOCAL_RUNTIME_PUBLICATIONS_ROOT", join(env("LOCAL_RUNTIME_ASSETS_ROOT", join("data", "runtime-assets")), "publications")));
const manifestPath = resolve(arg("--manifest", join(publicationsRoot, "current.json")));
const reportPath = resolve(arg("--out", env("LOCAL_NEWSLETTER_DELIVERY_REPORT", join(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"), "local-newsletter-delivery-report.json"))));
const dryRun = process.argv.includes("--dry-run");
const autoSend = !dryRun && env("NEWSLETTER_AUTO_SEND", "0") === "1";
const inMemoryCapture = env("LOCAL_NEWSLETTER_IN_MEMORY_CAPTURE", "0") === "1";
const batchLimit = Math.max(1, Math.min(500, Number.parseInt(env("NEWSLETTER_SEND_LIMIT", "100"), 10) || 100));
const generatedAt = new Date().toISOString();
const report = { generated_at: generatedAt, status: "starting", dry_run: dryRun, auto_send: autoSend, batch_limit: batchLimit, issue_synced: false, active_subscribers: 0, pending: 0, attempted: 0, sent: 0, failed: 0, safeguards: ["published-gate-only", "deterministic-content-only", "no-ai-public-content", "one-send-per-subscriber-and-issue", "failure-retry-cooldown", "list-unsubscribe", "no-recipient-pii-in-report"] };
function finish(status, extra = {}, exitCode = 0) { Object.assign(report, extra, { status }); mkdirSync(dirname(reportPath), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"); console.log(`Newsletter delivery ${status}: pending=${report.pending}, sent=${report.sent}, failed=${report.failed}, dry_run=${dryRun}.`); if (exitCode) process.exit(exitCode); }
async function run() {
if (!existsSync(dbPath) || !existsSync(manifestPath)) finish("not-ready", { error: "database-or-manifest-missing" }, 1);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const issue = manifest.issue || {};
const newsletterFile = (manifest.files || []).find((row) => row.path === "newsletter-assurance-immeuble.html");
const newsletterPath = join(dirname(manifestPath), "versions", clean(manifest.version, 140), "newsletter-assurance-immeuble.html");
const safe = manifest.marker === "runtime-editorial-publication-v1" && manifest.publication_gate?.ready === true && manifest.public_content_provider === "deterministic" && manifest.public_content_ai_generated === false && manifest.ai_draft_allowed_publication === false && newsletterFile && existsSync(newsletterPath) && hash(readFileSync(newsletterPath)) === newsletterFile.sha256;
if (!safe || !issue.id || !issue.slug || !issue.title) finish("held-unsafe-publication", { error: "active-publication-contract-failed" }, 1);
const newsletterHtml = readFileSync(newsletterPath, "utf8");
const plain = `${issue.title}\n\n${htmlText(newsletterHtml).slice(0, 7000)}\n\nLire l edition: https://immeubleassur.com/${issue.slug}\n\nInformation generale: toute interpretation contractuelle ou juridique reste soumise a validation humaine.`;
const subject = `ImmeubleAssur - veille assurance immeuble ${clean(issue.slug).slice(-10)}`;
const database = new DatabaseSync(dbPath);
try {
  database.exec("PRAGMA busy_timeout=5000");
  if (!dryRun) database.prepare(`INSERT INTO newsletter_issues (id, slug, title, subject, summary, status, html_url, plain_text, payload, created_at, published_at, sent_at) VALUES (?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, NULL) ON CONFLICT(slug) DO UPDATE SET title=excluded.title, subject=excluded.subject, summary=excluded.summary, status='published', html_url=excluded.html_url, plain_text=excluded.plain_text, payload=excluded.payload, published_at=COALESCE(newsletter_issues.published_at, excluded.published_at)`).run(clean(issue.id, 160), clean(issue.slug, 240), clean(issue.title, 300), subject, "Veille validee issue de sources attribuees.", clean(issue.html_url || `/${issue.slug}`, 500), plain, JSON.stringify({ manifest_version: manifest.version, publication_gate: manifest.publication_gate.observed, provider: manifest.public_content_provider, ai_generated: false }), manifest.activated_at || generatedAt, manifest.activated_at || generatedAt);
  report.issue_synced = !dryRun;
  const active = Number(database.prepare("SELECT COUNT(*) count FROM newsletter_subscribers WHERE status='active'").get().count || 0);
  report.active_subscribers = active;
  const pending = database.prepare(`SELECT s.id, s.email, s.unsubscribe_token FROM newsletter_subscribers s WHERE s.status='active' AND NOT EXISTS (SELECT 1 FROM newsletter_events e WHERE e.subscriber_id=s.id AND e.issue_id=? AND e.event_type='sent') AND NOT EXISTS (SELECT 1 FROM newsletter_events f WHERE f.subscriber_id=s.id AND f.issue_id=? AND f.event_type='send_failed' AND f.created_at >= datetime('now', '-60 minutes')) ORDER BY s.created_at ASC LIMIT ?`).all(clean(issue.id, 160), clean(issue.id, 160), batchLimit);
  report.pending = pending.length;
  if (dryRun) return finish("dry-run");
  if (!autoSend) return finish("synced-awaiting-auto-send");
  if (!pending.length) return finish(active ? "up-to-date" : "no-active-subscribers");
  const config = { host: env("SMTP_HOST"), port: env("SMTP_PORT", "587"), username: env("SMTP_USER"), password: env("SMTP_PASS"), from: env("SMTP_FROM", env("SMTP_USER")), to: [], secureTransport: env("SMTP_SECURE", "starttls") };
  for (const subscriber of pending) {
    report.attempted += 1;
    const unsubscribe = `https://immeubleassur.com/api/newsletter?unsubscribe=${encodeURIComponent(subscriber.unsubscribe_token)}`;
    const message = [`From: ImmeubleAssur <${config.from}>`, `To: ${subscriber.email}`, `Subject: ${subject}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <newsletter.${clean(issue.id, 120)}.${clean(subscriber.id, 120)}@immeubleassur.com>`, `List-Unsubscribe: <${unsubscribe}>`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", `${plain}\n\nSe desinscrire: ${unsubscribe}`].join("\r\n");
    try {
      const captureAllowed = inMemoryCapture && dbPath.startsWith(resolve(tmpdir())) && subscriber.email.endsWith("@example.test");
      if (inMemoryCapture && !captureAllowed) throw new Error("newsletter-in-memory-capture-scope-invalid");
      if (captureAllowed) {
        report.capture = { transport: "in-memory", verified: message.includes(`To: ${subscriber.email}`) && message.includes("List-Unsubscribe:") && message.includes(`Subject: ${subject}`), recipient_synthetic: true, external_delivery: false };
      }
      const receipt = captureAllowed ? "in-memory-newsletter-capture:accepted" : await sendNodeSmtpMail({ ...config, to: parseRecipients(subscriber.email) }, message);
      database.prepare("INSERT INTO newsletter_events (id, subscriber_id, issue_id, event_type, payload, created_at) VALUES (?, ?, ?, 'sent', ?, ?)").run(crypto.randomUUID(), subscriber.id, issue.id, JSON.stringify({ receipt: clean(receipt, 500), manifest_version: manifest.version }), new Date().toISOString()); report.sent += 1;
    } catch (error) {
      database.prepare("INSERT INTO newsletter_events (id, subscriber_id, issue_id, event_type, payload, created_at) VALUES (?, ?, ?, 'send_failed', ?, ?)").run(crypto.randomUUID(), subscriber.id, issue.id, JSON.stringify({ error: clean(error.message || "SMTP failure", 500), manifest_version: manifest.version }), new Date().toISOString()); report.failed += 1;
    }
  }
  const remaining = Number(database.prepare(`SELECT COUNT(*) count FROM newsletter_subscribers s WHERE s.status='active' AND NOT EXISTS (SELECT 1 FROM newsletter_events e WHERE e.subscriber_id=s.id AND e.issue_id=? AND e.event_type='sent')`).get(issue.id).count || 0);
  if (!remaining && report.failed === 0) database.prepare("UPDATE newsletter_issues SET sent_at=? WHERE id=?").run(new Date().toISOString(), issue.id);
  finish(report.failed ? "partial-failure" : remaining ? "batch-completed" : "completed", { remaining }, report.failed ? 1 : 0);
} finally { database.close(); }
}

await run();