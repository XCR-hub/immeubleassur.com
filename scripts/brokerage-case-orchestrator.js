import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { openLocalSqlite } from "./local-sqlite-db.js";
import {
  BROKERAGE_CASE_MARKER,
  buildClientEmailDraft,
  buildInsurerEmailDraft,
  caseReferenceForLead,
  clean,
  consentSnapshotFor,
  documentChecklistFor,
  leadValueEstimate,
  nextActionForCase,
  nowIso,
  portalToken,
  readinessScoreFor,
  stageForCase,
  stageLabel,
  urgencyForLead
} from "../functions/_shared/brokerage-cases.js";

loadDefaultEnvFiles();

const dbPath = env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite"));
const siteOrigin = env("SITE_ORIGIN", "https://immeubleassur.com");
const reportPath = env("BROKERAGE_CASE_REPORT", join("reports", "brokerage-case-orchestrator-report.json"));
const assetPath = env("BROKERAGE_CASE_PUBLIC_REPORT", join("public", "assets", "brokerage-case-orchestrator-latest.json"));
const maxLeads = Number.parseInt(process.argv.includes("--all") ? "500" : env("BROKERAGE_CASE_MAX_LEADS", "160"), 10) || 160;

function rows(database, sql, binds = []) {
  return database.prepare(sql).bind(...binds).all().results || [];
}

function first(database, sql, binds = []) {
  return database.prepare(sql).bind(...binds).first() || null;
}

function run(database, sql, binds = []) {
  return database.prepare(sql).bind(...binds).run();
}

function writeJson(file, payload) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function json(value) {
  return JSON.stringify(value || {});
}

function priorityFor(lead, readiness) {
  const score = Number(lead.lead_score || 0);
  const urgency = urgencyForLead(lead);
  if (urgency.level === "immediate" || score >= 85) return "hot";
  if (Number(readiness.score || 0) >= 70 || score >= 70) return "warm";
  if (score >= 45) return "standard";
  return "low";
}

function dueAtFor(priority, stage) {
  const hours = stage === "contract_active" ? 168 : priority === "hot" ? 2 : priority === "warm" ? 8 : priority === "standard" ? 24 : 48;
  return new Date(Date.now() + hours * 3600000).toISOString();
}

function materializeCase(database, lead, counters) {
  const existing = first(database, "SELECT * FROM brokerage_cases WHERE lead_id = ?", [lead.id]);
  const caseId = existing?.id || crypto.randomUUID();
  const createdAt = existing?.created_at || nowIso();
  const currentDocs = existing ? rows(database, "SELECT * FROM case_documents WHERE case_id = ?", [caseId]) : [];
  const readiness = readinessScoreFor(lead, currentDocs);
  const consultations = existing ? rows(database, "SELECT * FROM insurer_consultations WHERE case_id = ?", [caseId]) : [];
  const stage = stageForCase(lead, readiness, consultations);
  const priority = priorityFor(lead, readiness);
  const value = leadValueEstimate(lead, Number(lead.lead_score || 0));
  const nextAction = nextActionForCase(lead, readiness, stage);
  const consentSnapshot = consentSnapshotFor(lead);
  const payload = {
    marker: BROKERAGE_CASE_MARKER,
    lead_reference: lead.reference,
    stage_label: stageLabel(stage),
    urgency: urgencyForLead(lead),
    readiness_signals: readiness.signals,
    value_estimate: value,
    site_origin: siteOrigin
  };

  if (!existing) {
    run(database, `INSERT INTO brokerage_cases (id, lead_id, case_reference, stage, readiness_score, priority, estimated_value_min_cents, estimated_value_max_cents, client_portal_token, assigned_to, next_action, due_at, human_review_required, consent_snapshot, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`, [
      caseId,
      lead.id,
      caseReferenceForLead(lead),
      stage,
      readiness.score,
      priority,
      value.annual_premium_min * 100,
      value.annual_premium_max * 100,
      portalToken(),
      clean(lead.assigned_to, 120),
      nextAction,
      dueAtFor(priority, stage),
      json(consentSnapshot),
      json(payload),
      createdAt,
      nowIso()
    ]);
    run(database, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'case_created', 'system', ?, ?)", [crypto.randomUUID(), caseId, json({ lead_reference: lead.reference, marker: BROKERAGE_CASE_MARKER }), nowIso()]);
    counters.created += 1;
  } else {
    run(database, `UPDATE brokerage_cases SET stage = ?, readiness_score = ?, priority = ?, estimated_value_min_cents = ?, estimated_value_max_cents = ?, assigned_to = COALESCE(NULLIF(assigned_to, ''), ?), next_action = ?, due_at = COALESCE(due_at, ?), consent_snapshot = COALESCE(consent_snapshot, ?), payload = ?, updated_at = ? WHERE id = ?`, [
      stage,
      readiness.score,
      priority,
      value.annual_premium_min * 100,
      value.annual_premium_max * 100,
      clean(lead.assigned_to, 120),
      nextAction,
      dueAtFor(priority, stage),
      json(consentSnapshot),
      json(payload),
      nowIso(),
      caseId
    ]);
    counters.updated += 1;
  }

  const fullCase = first(database, "SELECT * FROM brokerage_cases WHERE id = ?", [caseId]);
  const expectedDocs = documentChecklistFor(lead);
  for (const doc of expectedDocs) {
    const result = run(database, `INSERT OR IGNORE INTO case_documents (id, case_id, document_type, label, required, status, requested_at, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, doc.document_type, doc.label, doc.required, nowIso(), json({ marker: BROKERAGE_CASE_MARKER }), nowIso(), nowIso()]);
    if (Number(result.meta?.changes || 0) > 0) counters.documents_requested += 1;
  }
  const docs = rows(database, "SELECT * FROM case_documents WHERE case_id = ? ORDER BY required DESC, label", [caseId]);
  const refreshedReadiness = readinessScoreFor(lead, docs);
  run(database, "UPDATE brokerage_cases SET readiness_score = ?, updated_at = ? WHERE id = ?", [refreshedReadiness.score, nowIso(), caseId]);

  const clientDraftExists = first(database, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'client' AND status IN ('draft_review', 'approved', 'sent')", [caseId]);
  if (!clientDraftExists) {
    const draft = buildClientEmailDraft(lead, fullCase, docs, siteOrigin);
    run(database, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
      VALUES (?, ?, 'client', ?, ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, clean(lead.email, 180), draft.subject, draft.body, nowIso(), json({ marker: BROKERAGE_CASE_MARKER, purpose: "document_collection" }), nowIso(), nowIso()]);
    counters.mail_drafts += 1;
  }

  const insurerDraftExists = first(database, "SELECT id FROM case_mail_queue WHERE case_id = ? AND audience = 'insurer' AND status IN ('draft_review', 'approved', 'sent')", [caseId]);
  if (!insurerDraftExists && refreshedReadiness.score >= 55) {
    const draft = buildInsurerEmailDraft(lead, fullCase, docs);
    run(database, `INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, scheduled_at, payload, created_at, updated_at)
      VALUES (?, ?, 'insurer', '', ?, ?, 'draft_review', 1, ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, draft.subject, draft.body, nowIso(), json({ marker: BROKERAGE_CASE_MARKER, purpose: "market_consultation", requires_partner_selection: true }), nowIso(), nowIso()]);
    counters.mail_drafts += 1;
  }

  if (refreshedReadiness.score >= 70) {
    const activePartners = rows(database, "SELECT * FROM insurer_partners WHERE active = 1 ORDER BY service_level_hours ASC, name LIMIT 3");
    for (const partner of activePartners) {
      const exists = first(database, "SELECT id FROM insurer_consultations WHERE case_id = ? AND insurer_name = ?", [caseId, partner.name]);
      if (exists) continue;
      run(database, `INSERT INTO insurer_consultations (id, case_id, partner_id, insurer_name, recipient_email, status, package_status, response_due_at, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'draft_review', 'ready_for_human_review', ?, ?, ?, ?)`, [crypto.randomUUID(), caseId, partner.id, partner.name, clean(partner.contact_email, 180), new Date(Date.now() + Number(partner.service_level_hours || 48) * 3600000).toISOString(), json({ marker: BROKERAGE_CASE_MARKER, appetite_profile: partner.appetite_profile }), nowIso(), nowIso()]);
      counters.consultations_prepared += 1;
    }
  }

  return { case_id: caseId, stage, priority, readiness_score: refreshedReadiness.score, reference: fullCase?.case_reference || caseReferenceForLead(lead) };
}

function buildSummary(database) {
  const base = first(database, `SELECT COUNT(*) AS cases, SUM(CASE WHEN stage NOT IN ('contract_active', 'lost') THEN 1 ELSE 0 END) AS open_cases, SUM(CASE WHEN priority = 'hot' THEN 1 ELSE 0 END) AS hot_cases, SUM(CASE WHEN readiness_score >= 70 THEN 1 ELSE 0 END) AS ready_cases, SUM(CASE WHEN human_review_required = 1 THEN 1 ELSE 0 END) AS human_review_required, COALESCE(SUM(estimated_value_min_cents), 0) AS value_min_cents, COALESCE(SUM(estimated_value_max_cents), 0) AS value_max_cents FROM brokerage_cases`, []);
  const docs = first(database, `SELECT COUNT(*) AS requested, SUM(CASE WHEN status IN ('received', 'validated') THEN 1 ELSE 0 END) AS received, SUM(CASE WHEN required = 1 AND status NOT IN ('received', 'validated') THEN 1 ELSE 0 END) AS missing_required FROM case_documents`, []);
  const mail = first(database, `SELECT COUNT(*) AS drafts, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_drafts, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent FROM case_mail_queue`, []);
  const consult = first(database, `SELECT COUNT(*) AS consultations, SUM(CASE WHEN status = 'draft_review' THEN 1 ELSE 0 END) AS review_consultations, SUM(CASE WHEN status IN ('sent', 'answered', 'quoted') THEN 1 ELSE 0 END) AS active_consultations FROM insurer_consultations`, []);
  return {
    ...base,
    documents: docs,
    mail_queue: mail,
    consultations: consult,
    pipeline_value_label: `${Math.round(Number(base?.value_min_cents || 0) / 100)}-${Math.round(Number(base?.value_max_cents || 0) / 100)} EUR/an`
  };
}

function main() {
  const database = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  const counters = { scanned: 0, created: 0, updated: 0, documents_requested: 0, mail_drafts: 0, consultations_prepared: 0 };
  const leads = rows(database, `SELECT * FROM leads WHERE status NOT IN ('lost', 'archived') ORDER BY created_at DESC LIMIT ?`, [maxLeads]);
  counters.scanned = leads.length;
  const touched = leads.map((lead) => materializeCase(database, lead, counters));
  const report = {
    generated_at: nowIso(),
    status: "passed",
    marker: BROKERAGE_CASE_MARKER,
    site_origin: siteOrigin,
    counters,
    summary: buildSummary(database),
    touched_cases: touched.slice(0, 30),
    safeguards: ["human-review-before-send", "explicit-case-consent-snapshot", "client-portal-token", "audit-timeline", "local-sqlite-only"]
  };
  writeJson(reportPath, report);
  writeJson(assetPath, report);
  database.close();
  console.log(`Brokerage case orchestrator: ${counters.scanned} lead(s), ${counters.created} case(s) created, ${counters.mail_drafts} mail draft(s), ${counters.consultations_prepared} consultation(s).`);
}

main();