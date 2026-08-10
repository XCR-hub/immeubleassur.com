import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestGet, onRequestPost } from "../functions/api/newsletter.js";

const reportPath = resolve(process.env.LOCAL_NEWSLETTER_CANARY_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "newsletter-runtime-canary-report.json"));
const dbPath = join(tmpdir(), `immeubleassur-newsletter-canary-${process.pid}-${Date.now()}.sqlite`);
const deliveryOnePath = join(tmpdir(), `immeubleassur-newsletter-delivery-one-${process.pid}.json`);
const deliveryTwoPath = join(tmpdir(), `immeubleassur-newsletter-delivery-two-${process.pid}.json`);
const deliveryThreePath = join(tmpdir(), `immeubleassur-newsletter-delivery-three-${process.pid}.json`);

function cleanup() {
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, deliveryOnePath, deliveryTwoPath, deliveryThreePath]) {
    if (existsSync(file)) unlinkSync(file);
  }
}
function hashString(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);
}
function payload(consent, sequence) {
  const sessionId = `newsletter-runtime-${Date.now().toString(36)}-${sequence}`;
  const pageUrl = "https://immeubleassur.com/actualites";
  return {
    email: "newsletter-runtime-canary@example.test",
    name: "Lecteur assurance immeuble",
    audience: "assurance-immeuble",
    source: "newsletter-runtime-canary",
    consent,
    page_url: pageUrl,
    session_id: sessionId,
    anti_bot: {
      js_enabled: true,
      form_elapsed_ms: 4200,
      interaction_count: 2,
      session_token: Math.abs(hashString(`${sessionId}:immeubleassur.com`)).toString(36)
    }
  };
}
async function subscribe(DB, body) {
  const request = new Request("https://immeubleassur.com/api/newsletter", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://immeubleassur.com", "User-Agent": "Mozilla/5.0 ImmeubleAssurRuntime" },
    body: JSON.stringify(body)
  });
  const response = await onRequestPost({ request, env: { DB } });
  return { status: response.status, body: await response.json() };
}
function deliver(out) {
  return spawnSync(process.execPath, ["scripts/local-newsletter-delivery.js", "--db", dbPath, "--out", out], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEWSLETTER_AUTO_SEND: "1",
      LOCAL_NEWSLETTER_IN_MEMORY_CAPTURE: "1",
      SMTP_FROM: "newsletter-canary@immeubleassur.test"
    },
    encoding: "utf8"
  });
}
async function unsubscribe(DB, token) {
  const request = new Request(`https://immeubleassur.com/api/newsletter?unsubscribe=${encodeURIComponent(token)}`);
  const response = await onRequestGet({ request, env: { DB } });
  return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}
async function run() {
  cleanup();
  const DB = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  try {
    const refused = await subscribe(DB, payload(false, 0));
    const first = await subscribe(DB, payload(true, 1));
    const duplicate = await subscribe(DB, payload(true, 2));
    const subscribers = Number(await DB.prepare("SELECT COUNT(*) AS count FROM newsletter_subscribers").first("count") || 0);
    const active = Number(await DB.prepare("SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE status='active' AND consent_text<>'' AND confirmed_at IS NOT NULL").first("count") || 0);
    const subscribedEvents = Number(await DB.prepare("SELECT COUNT(*) AS count FROM newsletter_events WHERE event_type='subscribed'").first("count") || 0);
    const subscriberRow = await DB.prepare("SELECT id FROM newsletter_subscribers LIMIT 1").first();
    const activeManifest = JSON.parse(readFileSync(join("data", "runtime-assets", "publications", "current.json"), "utf8"));
    const activeIssue = activeManifest.issue;
    await DB.prepare("INSERT INTO newsletter_issues (id, slug, title, subject, status, created_at) VALUES (?, ?, ?, ?, 'published', ?)").bind(activeIssue.id, activeIssue.slug, activeIssue.title, activeIssue.title, new Date().toISOString()).run();
    await DB.prepare("INSERT INTO newsletter_events (id, subscriber_id, issue_id, event_type, payload, created_at) VALUES (?, ?, ?, 'send_claimed', ?, ?)").bind("canary-active-claim", subscriberRow.id, activeIssue.id, JSON.stringify({ lease_minutes: 15 }), new Date().toISOString()).run();

    const deliveryOneResult = deliver(deliveryOnePath);
    const deliveryOne = existsSync(deliveryOnePath) ? JSON.parse(readFileSync(deliveryOnePath, "utf8")) : {};
    await DB.prepare("UPDATE newsletter_events SET created_at = datetime('now', '-20 minutes') WHERE id = 'canary-active-claim'").run();
    const deliveryTwoResult = deliver(deliveryTwoPath);
    const deliveryTwo = existsSync(deliveryTwoPath) ? JSON.parse(readFileSync(deliveryTwoPath, "utf8")) : {};
    const deliveryThreeResult = deliver(deliveryThreePath);
    const deliveryThree = existsSync(deliveryThreePath) ? JSON.parse(readFileSync(deliveryThreePath, "utf8")) : {};
    const sentEvents = Number(await DB.prepare("SELECT COUNT(*) AS count FROM newsletter_events WHERE event_type='sent'").first("count") || 0);
    const issueSent = Number(await DB.prepare("SELECT COUNT(*) AS count FROM newsletter_issues WHERE sent_at IS NOT NULL").first("count") || 0);
    const subscriber = await DB.prepare("SELECT unsubscribe_token FROM newsletter_subscribers LIMIT 1").first();
    const unsubscribeResult = await unsubscribe(DB, subscriber?.unsubscribe_token || "");
    const unsubscribed = Number(await DB.prepare("SELECT COUNT(*) AS count FROM newsletter_subscribers WHERE status='unsubscribed' AND unsubscribed_at IS NOT NULL").first("count") || 0);
    const unsubscribeEvents = Number(await DB.prepare("SELECT COUNT(*) AS count FROM newsletter_events WHERE event_type='unsubscribed'").first("count") || 0);
    const unsubscribeEvent = await DB.prepare("SELECT payload FROM newsletter_events WHERE event_type='unsubscribed' LIMIT 1").first();
    const unsubscribePrivacy = unsubscribeResult.headers["cache-control"]?.includes("no-store") && unsubscribeResult.headers["referrer-policy"] === "no-referrer" && unsubscribeResult.headers["x-robots-tag"]?.includes("noindex") && !unsubscribeResult.body.includes("newsletter-runtime-canary@example.test") && !String(unsubscribeEvent?.payload || "").includes("@");

    const success = refused.status === 422 && refused.body?.success === false &&
      first.status === 200 && first.body?.status === "active" &&
      duplicate.status === 200 && duplicate.body?.status === "active" &&
      subscribers === 1 && active === 1 && subscribedEvents === 2 &&
      deliveryOneResult.status === 0 && deliveryOne.status === "up-to-date" &&
      deliveryOne.sent === 0 && deliveryOne.failed === 0 &&
      deliveryTwoResult.status === 0 && deliveryTwo.status === "completed" &&
      deliveryTwo.sent === 1 && deliveryTwo.capture?.verified === true && deliveryTwo.capture?.external_delivery === false &&
      deliveryThreeResult.status === 0 && deliveryThree.status === "up-to-date" &&
      deliveryThree.sent === 0 && sentEvents === 1 && issueSent === 1 &&
      unsubscribeResult.status === 200 && unsubscribed === 1 && unsubscribeEvents === 1 && unsubscribePrivacy;

    const report = {
      generated_at: new Date().toISOString(),
      status: success ? "passed" : "failed",
      success,
      scenario: "newsletter-consent-dedupe-delivery-idempotence",
      subscription: {
        consent_refused: refused.status === 422,
        first_activated: first.status === 200 && first.body?.status === "active",
        repeat_activated_same_subscriber: duplicate.status === 200 && subscribers === 1,
        consent_recorded: active === 1,
        subscribers,
        subscribed_events: subscribedEvents
      },
      delivery: {
        active_claim_blocked: deliveryOne.status === "up-to-date" && Number(deliveryOne.sent || 0) === 0,
        expired_claim_recovered: deliveryTwo.status === "completed" && Number(deliveryTwo.sent || 0) === 1,
        idempotent_status: deliveryThree.status || "",
        idempotent_sent: Number(deliveryThree.sent || 0),
        sent_events: sentEvents,
        issue_marked_sent: issueSent === 1,
        capture_verified: deliveryTwo.capture?.verified === true,
        transport: deliveryTwo.capture?.transport || "",
        recipient_synthetic: deliveryTwo.capture?.recipient_synthetic === true,
        external_delivery: false
      },
      unsubscribe: {
        status: unsubscribeResult.status,
        confirmed: unsubscribeResult.status === 200 && unsubscribeResult.body.includes("Desinscription prise en compte"),
        privacy_protected: unsubscribePrivacy,
        recipient_exposed: unsubscribeResult.body.includes("newsletter-runtime-canary@example.test") || String(unsubscribeEvent?.payload || "").includes("@"),
        inactive_subscribers: unsubscribed,
        events: unsubscribeEvents
      },
      safeguards: ["sqlite-temp-db", "synthetic-recipient-only", "in-memory-smtp-capture", "no-external-email-delivery", "consent-required", "one-subscriber-per-email", "one-send-per-issue", "active-claim-blocks-overlap", "expired-claim-recovers", "last-moment-active-consent-check", "unsubscribe-no-store", "unsubscribe-no-referrer", "unsubscribe-no-recipient-pii", "no-recipient-or-message-exported"]
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (!success) throw new Error(`newsletter-runtime-canary-failed: ${JSON.stringify(report)}`);
    console.log("Newsletter runtime canary passed: consent, dedupe, idempotent in-memory delivery and unsubscribe verified.");
  } finally {
    DB.close();
    cleanup();
  }
}
run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

