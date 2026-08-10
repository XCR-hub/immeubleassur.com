import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestPost } from "../functions/api/leads.js";
import { onRequestGet as getAdminIntegrations } from "../functions/api/admin/integrations.js";
import { onRequestGet as getAdminSales } from "../functions/api/admin/sales.js";
import { onRequestGet as getAdminSeo } from "../functions/api/admin/seo.js";
import { onRequestGet as getAdminSpam } from "../functions/api/admin/spam.js";

const REPORT_PATH = process.env.LOCAL_LEAD_CANARY_REPORT || join(process.env.LOCAL_RUNTIME_REPORTS_ROOT || "reports", "lead-dedupe-runtime-report.json");
const dbPath = join(tmpdir(), `immeubleassur-dedupe-${process.pid}-${Date.now()}.sqlite`);

function cleanup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) unlinkSync(file);
  }
}

function hashString(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum + char.charCodeAt(0)) | 0, 0);
}

function sessionToken(sessionId, hostname) {
  return Math.abs(hashString(`${sessionId}:${hostname}`)).toString(36);
}

async function submitLead(DB, payload, extraEnv = {}) {
  const request = new Request("https://immeubleassur.com/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://immeubleassur.com",
      "User-Agent": "Mozilla/5.0 ImmeubleAssurDedupeCheck"
    },
    body: JSON.stringify(payload)
  });
  const response = await onRequestPost({ request, env: { DB, ...extraEnv }, waitUntil: () => {} });
  return { status: response.status, body: await response.json() };
}

async function adminGet(handler, DB, path) {
  const token = "dedupe-admin-token";
  const request = new Request(`https://immeubleassur.com${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const response = await handler({ request, env: { DB, ADMIN_API_TOKEN: token } });
  return { status: response.status, body: await response.json() };
}

function buildPayload() {
  const sessionId = `dedupe-${Date.now().toString(36)}`;
  const email = `dedupe-${Date.now()}@example.com`;
  const pageUrl = "https://immeubleassur.com/devis-assurance-immeuble";
  return {
    name: "Test Dedupe ImmeubleAssur",
    phone: "06 12 34 56 78",
    email,
    profile: "sci",
    property_type: "immeuble-locatif",
    city: "Melun",
    units_count: "12",
    need: "multirisque-immeuble",
    message: "Contrat actuel, echeance et sinistres 36 mois disponibles pour verifier le dedoublonnage.",
    consent: true,
    source: "lead-dedupe-runtime-check",
    page_url: pageUrl,
    session_id: sessionId,
    anti_bot: {
      js_enabled: true,
      form_elapsed_ms: 5000,
      interaction_count: 3,
      session_token: sessionToken(sessionId, "immeubleassur.com")
    },
    utm: {}
  };
}

function buildExpressPayload() {
  const sessionId = `express-${Date.now().toString(36)}`;
  const pageUrl = "https://immeubleassur.com/devis-assurance-immeuble";
  return {
    phone: "06 22 33 44 55",
    need: "pno-cno",
    consent: true,
    submission_mode: "express-callback",
    source: "lead-express-runtime-check",
    page_url: pageUrl,
    session_id: sessionId,
    anti_bot: {
      js_enabled: true,
      form_elapsed_ms: 5200,
      interaction_count: 2,
      session_token: sessionToken(sessionId, "immeubleassur.com")
    },
    utm: { intent: "pno-cno" }
  };
}

async function run() {
  cleanup();
  const DB = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  try {
    const payload = buildPayload();
    const capturedNotifications = [];
    const fakeSmtpEnv = {
      SMTP_HOST: "127.0.0.1", SMTP_PORT: "2525", SMTP_USER: "canary@immeubleassur.test", SMTP_PASS: "canary-smtp-secret-value",
      SMTP_FROM: "canary@immeubleassur.test", SMTP_TO: "team@immeubleassur.com",
      SEND_SMTP_MAIL: async (config, message) => { capturedNotifications.push({ config, message }); return "canary:accepted"; }
    };
    const first = await submitLead(DB, payload, fakeSmtpEnv);
    const second = await submitLead(DB, payload);
    const express = await submitLead(DB, buildExpressPayload());
    const racePayload = { ...buildPayload(), email: `race-${Date.now()}@example.com`, phone: "06 77 88 99 00", city: "Nantes", need: "concurrence-exacte" };
    const [raceA, raceB] = await Promise.all([submitLead(DB, racePayload, fakeSmtpEnv), submitLead(DB, racePayload, fakeSmtpEnv)]);
    const leadCount = await DB.prepare("SELECT COUNT(*) AS count FROM leads").first("count");
    const duplicateEvents = await DB.prepare("SELECT COUNT(*) AS count FROM site_events WHERE event_type = ?").bind("lead_duplicate_filtered").first("count");
    const duplicateLeadEvents = await DB.prepare("SELECT COUNT(*) AS count FROM lead_events WHERE event_type = ?").bind("lead_duplicate_filtered").first("count");
    const duplicateNotificationEvents = await DB.prepare("SELECT COUNT(*) AS count FROM lead_events WHERE event_type IN (?, ?)").bind("duplicate_email_notification_sent", "duplicate_email_notification_failed").first("count");
    const emailNotificationEvents = await DB.prepare("SELECT COUNT(*) AS count FROM lead_events WHERE event_type = ?").bind("email_notification_sent").first("count");
    const expressRecord = express.body?.reference ? await DB.prepare("SELECT name, phone, email, profile, property_type, city, message FROM leads WHERE reference = ?").bind(express.body.reference).first() : null;
    const expressEventRow = express.body?.id ? await DB.prepare("SELECT payload FROM lead_events WHERE lead_id = ? AND event_type = ?").bind(express.body.id, "lead_created").first() : null;
    let expressEvent = {};
    try { expressEvent = JSON.parse(expressEventRow?.payload || "{}"); } catch {}
    const [adminSpam, adminSeo, adminIntegrations, adminSales] = await Promise.all([
      adminGet(getAdminSpam, DB, "/api/admin/spam"),
      adminGet(getAdminSeo, DB, "/api/admin/seo"),
      adminGet(getAdminIntegrations, DB, "/api/admin/integrations"),
      adminGet(getAdminSales, DB, "/api/admin/sales")
    ]);
    const adminSpamDuplicates = Number(adminSpam.body?.summary?.duplicate_leads_30d || 0);
    const adminSeoDuplicates = Number(adminSeo.body?.conversion_funnel?.duplicate_filtered || 0);
    const adminIntegrationsDuplicates = Number(adminIntegrations.body?.reports?.lead_duplicates_30d || 0);
    const adminSalesDuplicateFollowups = Number(adminSales.body?.summary?.duplicate_followups || 0);
    const adminSalesDuplicateRows = Array.isArray(adminSales.body?.duplicate_followups) ? adminSales.body.duplicate_followups.length : 0;
    const adminSalesLeadMarked = (adminSales.body?.relance_leads || []).some((lead) => lead.duplicate_followup && lead.reference === first.body?.reference);
    const capturedNotification = capturedNotifications.find((item) => String(item.message || "").includes(`Subject: Nouveau lead ImmeubleAssur ${first.body?.reference}`));
    const capturedMessage = String(capturedNotification?.message || "");
    const raceResults = [raceA, raceB];
    const raceCreated = raceResults.filter((item) => item.status === 200 && item.body?.success === true && !item.body?.duplicate);
    const raceDuplicates = raceResults.filter((item) => item.status === 200 && item.body?.duplicate === true && item.body?.status === "duplicate_concurrent" && item.body?.notification === "skipped");
    const concurrencyVerified = raceCreated.length === 1 && raceDuplicates.length === 1 && raceA.body?.id === raceB.body?.id && raceA.body?.reference === raceB.body?.reference;
    const notificationVerified = first.body?.notification === "sent" && capturedNotification?.config?.to?.includes("team@immeubleassur.com") && capturedMessage.includes("To: team@immeubleassur.com") && capturedMessage.includes(`Subject: Nouveau lead ImmeubleAssur ${first.body?.reference}`) && capturedMessage.includes(`Reference: ${first.body?.reference}`) && !capturedMessage.includes(fakeSmtpEnv.SMTP_PASS);
    const dedupeVerified = first.status === 200 && first.body?.success === true && !first.body?.duplicate && notificationVerified && emailNotificationEvents === 2 && second.status === 200 && second.body?.duplicate === true && second.body?.notification === "skipped" && leadCount === 3 && duplicateEvents === 2 && duplicateLeadEvents === 2 && duplicateNotificationEvents === 0;
    const adminVerified = adminSpam.status === 200 && adminSeo.status === 200 && adminIntegrations.status === 200 && adminSales.status === 200 && adminSpamDuplicates === 2 && adminSeoDuplicates === 2 && adminIntegrationsDuplicates === 2 && adminSalesDuplicateFollowups === 2 && adminSalesDuplicateRows === 2 && adminSalesLeadMarked;
    const expressVerified = express.status === 200 && express.body?.success === true && express.body?.submission_mode === "express-callback" && String(express.body?.next_action || "").includes("Rappeler") && expressRecord?.name === "A preciser" && expressRecord?.email === "" && expressRecord?.profile === "a-preciser" && expressRecord?.property_type === "a-preciser" && expressRecord?.city === "a-preciser" && String(expressRecord?.message || "").includes("Mode rappel express") && expressEvent?.submission_mode === "express-callback" && expressEvent?.contact_mode === "telephone";

    const report = {
      generated_at: new Date().toISOString(),
      status: dedupeVerified && adminVerified && expressVerified && concurrencyVerified ? "passed" : "failed",
      success: dedupeVerified && adminVerified && expressVerified && concurrencyVerified,
      scenario: "repeated-and-concurrent-lead-dedupe-with-express-callback",
      first: {
        status: first.status,
        success: first.body?.success === true,
        duplicate: Boolean(first.body?.duplicate),
        score: Number(first.body?.score || 0),
        notification: first.body?.notification || ""
      },
      second: {
        status: second.status,
        success: second.body?.success === true,
        duplicate: second.body?.duplicate === true,
        result_status: second.body?.status || "",
        duplicate_reason: second.body?.duplicate_reason || "",
        notification: second.body?.notification || ""
      },
      concurrent: {
        verified: concurrencyVerified,
        created: raceCreated.length,
        duplicates: raceDuplicates.length,
        same_id: raceA.body?.id === raceB.body?.id,
        same_reference: raceA.body?.reference === raceB.body?.reference,
        duplicate_reason: raceDuplicates[0]?.body?.duplicate_reason || "",
        duplicate_notification: raceDuplicates[0]?.body?.notification || ""
      },
      express: {
        status: express.status,
        success: express.body?.success === true,
        submission_mode: express.body?.submission_mode || "",
        contact_mode: expressEvent?.contact_mode || "",
        placeholders_ok: expressRecord?.name === "A preciser" && expressRecord?.profile === "a-preciser" && expressRecord?.property_type === "a-preciser" && expressRecord?.city === "a-preciser",
        next_action: express.body?.next_action || "",
        notification: express.body?.notification || ""
      },
      counts: {
        leads: leadCount,
        duplicate_site_events: duplicateEvents,
        duplicate_lead_events: duplicateLeadEvents,
        duplicate_notification_events: duplicateNotificationEvents,
        email_notification_events: emailNotificationEvents
      },
      notification_capture: {
        verified: notificationVerified,
        transport: capturedNotification ? "in-memory" : "missing",
        captured_messages: capturedNotifications.length,
        recipient_is_team: capturedNotification?.config?.to?.includes("team@immeubleassur.com") === true,
        subject_has_reference: capturedMessage.includes(`Subject: Nouveau lead ImmeubleAssur ${first.body?.reference}`),
        body_has_reference: capturedMessage.includes(`Reference: ${first.body?.reference}`),
        secret_absent: !capturedMessage.includes(fakeSmtpEnv.SMTP_PASS)
      },
      admin: {
        spam: {
          status: adminSpam.status,
          duplicate_leads_30d: adminSpamDuplicates,
          duplicate_filter_rate: Number(adminSpam.body?.summary?.duplicate_filter_rate || 0),
          duplicate_rows: Array.isArray(adminSpam.body?.duplicates) ? adminSpam.body.duplicates.length : 0
        },
        seo: {
          status: adminSeo.status,
          duplicate_filtered: adminSeoDuplicates,
          attempt_to_handled_lead_rate: Number(adminSeo.body?.conversion_funnel?.attempt_to_handled_lead_rate || 0)
        },
        integrations: {
          status: adminIntegrations.status,
          lead_duplicates_30d: adminIntegrationsDuplicates,
          duplicate_rows: Array.isArray(adminIntegrations.body?.reports?.recent_duplicate_leads) ? adminIntegrations.body.reports.recent_duplicate_leads.length : 0
        },
        sales: {
          status: adminSales.status,
          duplicate_followups: adminSalesDuplicateFollowups,
          duplicate_rows: adminSalesDuplicateRows,
          lead_marked: adminSalesLeadMarked
        }
      },
      safeguards: ["sqlite-temp-db", "no-smtp-config", "no-real-lead-persisted", "duplicate-does-not-create-new-lead", "duplicate-email-skips-without-smtp", "atomic-exact-concurrent-dedupe", "one-notification-for-concurrent-submissions", "admin-duplicate-metrics-verified", "sales-duplicate-followup-verified", "express-callback-minimal-contact-verified", "in-memory-smtp-capture", "no-external-email-delivery", "email-body-not-exported"]
    };

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(REPORT_PATH, process.platform === "win32" ? reportText.replace(/\n/g, "\r\n") : reportText, "utf8");
    if (!report.success) {
      console.error(`Lead dedupe runtime failed: ${JSON.stringify(report.counts)}`);
      process.exit(1);
    }
    console.log(`Lead dedupe runtime passed: ${leadCount} leads, ${duplicateEvents} duplicate events, concurrent exact submission and express callback verified.`);
  } finally {
    DB.close();
    cleanup();
  }
}

run().catch((error) => {
  cleanup();
  console.error(`Lead dedupe runtime failed: ${error.message || error}`);
  process.exit(1);
});