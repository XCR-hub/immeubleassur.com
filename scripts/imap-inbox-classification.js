const TEAM = "team@immeubleassur.com";
const MARKER = "imap-inbox-classification-v1";

function addresses(value) {
  return [...new Set((String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(item => item.toLowerCase()))];
}

export function classifyInboxMessage(row, findLeads = () => []) {
  if (row.case_id || row.status !== "received_pending_review" || row.matched_reference) return null;
  const from = addresses(row.sender);
  const to = addresses(row.recipients);
  if (from.length !== 1 || from[0] !== TEAM || to.length !== 1 || to[0] !== TEAM) return null;
  const subject = String(row.subject || "").normalize("NFD").replace(/\p{M}/gu, "").trim();
  const notification = subject.match(/^(?:Nouveau lead|Retour prospect) ImmeubleAssur (IMB-\d{8}-[A-Z0-9]{4,})(?: - TELEPHONE SEUL)?$/i);
  if (notification) {
    const leads = findLeads(notification[1]);
    return leads.length === 1 ? { status: "linked_lead_notification", reason: "known-lead-notification", lead_id: leads[0].id, reference: leads[0].reference } : null;
  }
  if (/\b(?:DOS-|IMB-)/i.test(subject)) return null;
  const rules = [
    ["runtime-alert", /^Alerte ImmeubleAssur production$/i],
    ["sla-alert", /^Relances SLA ImmeubleAssur:\s*\d+ dossier\(s\)$/i],
    ["editorial-alert", /^Revue editoriale ImmeubleAssur - (?:(?:A TRAITER|CRITIQUE) )?JURIDIQUE news-veille-assurance-immeuble-\d{4}-\d{2}-\d{2}$/i],
    ["imap-backlog-alert", /^ImmeubleAssur - \d+ email\(s\) entrant\(s\) sans dossier$/i]
  ];
  const rule = rules.find(([, pattern]) => pattern.test(subject));
  return rule ? { status: "ignored_automation", reason: rule[0] } : null;
}

export function reconcileStoredInbox(db, now = new Date().toISOString()) {
  const report = { examined: 0, classified_automation: 0, linked_lead_notifications: 0 };
  db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db.prepare("SELECT id, case_id, sender, recipients, subject, matched_reference, status, payload FROM case_mail_inbox WHERE case_id IS NULL AND status = 'received_pending_review' ORDER BY created_at ASC LIMIT 1000").all().results;
    const findLeads = reference => db.prepare("SELECT id, reference FROM leads WHERE reference = ? COLLATE NOCASE LIMIT 2").bind(reference).all().results;
    for (const row of rows) {
      report.examined++;
      const decision = classifyInboxMessage(row, findLeads);
      if (!decision) continue;
      let payload;
      try { payload = JSON.parse(row.payload || "{}"); } catch { continue; }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
      const next = { ...payload, inbox_classification: { marker: MARKER, reason: decision.reason,
        classified_at: now, previous_status: row.status, reversible: true, body_read: false,
        mailbox_changed: false, human_approval_granted: false,
        ...(decision.lead_id ? { lead_id: decision.lead_id, commercial_followup_in_leads: true } : {}) } };
      const result = db.prepare("UPDATE case_mail_inbox SET status = ?, matched_reference = ?, payload = ?, updated_at = ? WHERE id = ? AND case_id IS NULL AND status = 'received_pending_review' AND COALESCE(matched_reference, '') = '' AND COALESCE(payload, '') = ? AND sender = ? AND recipients = ? AND subject = ?")
        .bind(decision.status, decision.reference || "", JSON.stringify(next), now, row.id, row.payload || "", row.sender, row.recipients, row.subject).run();
      if (result.meta.changes === 1) report[decision.lead_id ? "linked_lead_notifications" : "classified_automation"]++;
    }
    db.exec("COMMIT");
    return report;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
