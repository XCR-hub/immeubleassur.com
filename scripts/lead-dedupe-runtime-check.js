import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestPost } from "../functions/api/leads.js";

const REPORT_PATH = join("reports", "lead-dedupe-runtime-report.json");
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

async function submitLead(DB, payload) {
  const request = new Request("https://immeubleassur.com/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://immeubleassur.com",
      "User-Agent": "Mozilla/5.0 ImmeubleAssurDedupeCheck"
    },
    body: JSON.stringify(payload)
  });
  const response = await onRequestPost({ request, env: { DB }, waitUntil: () => {} });
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

async function run() {
  cleanup();
  const DB = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  try {
    const payload = buildPayload();
    const first = await submitLead(DB, payload);
    const second = await submitLead(DB, payload);
    const leadCount = await DB.prepare("SELECT COUNT(*) AS count FROM leads").first("count");
    const duplicateEvents = await DB.prepare("SELECT COUNT(*) AS count FROM site_events WHERE event_type = ?").bind("lead_duplicate_filtered").first("count");
    const duplicateLeadEvents = await DB.prepare("SELECT COUNT(*) AS count FROM lead_events WHERE event_type = ?").bind("lead_duplicate_filtered").first("count");

    const report = {
      success: first.status === 200 && first.body?.success === true && !first.body?.duplicate && second.status === 200 && second.body?.duplicate === true && leadCount === 1 && duplicateEvents === 1 && duplicateLeadEvents === 1,
      scenario: "repeated-lead-dedupe",
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
        duplicate_reason: second.body?.duplicate_reason || ""
      },
      counts: {
        leads: leadCount,
        duplicate_site_events: duplicateEvents,
        duplicate_lead_events: duplicateLeadEvents
      },
      safeguards: ["sqlite-temp-db", "no-smtp-config", "no-real-lead-persisted", "duplicate-does-not-create-new-lead"]
    };

    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    const reportText = `${JSON.stringify(report, null, 2)}\n`;
    writeFileSync(REPORT_PATH, process.platform === "win32" ? reportText.replace(/\n/g, "\r\n") : reportText, "utf8");
    if (!report.success) {
      console.error(`Lead dedupe runtime failed: ${JSON.stringify(report.counts)}`);
      process.exit(1);
    }
    console.log(`Lead dedupe runtime passed: ${leadCount} lead, ${duplicateEvents} duplicate event.`);
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