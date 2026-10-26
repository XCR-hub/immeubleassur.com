import { adminRequestAllowed } from "../../_shared/admin-auth.js";
import { qjson, qerror, createQuestionnaire, first, run, timeline, processSubmission, downloadQuestionnaire } from "../../_shared/risk-questionnaire.js";
const failure = error => qjson({ success: false, error: error.status ? error.message : "Service momentanément indisponible" }, error.status || 503);
export async function onRequestGet({ request, env }) {
  if (!adminRequestAllowed(request, env)) return qjson({ success: false, error: "Accès refusé" }, 401);
  try {
    const url = new URL(request.url), id = url.searchParams.get("submission_id");
    if (url.searchParams.get("action") === "download") return await downloadQuestionnaire(env, await first(env, "SELECT * FROM client_risk_submissions WHERE id = ?", id || ""), url.searchParams.get("file") || 0);
    const result = await env.DB.prepare("SELECT q.id, q.case_id, q.expires_at, q.revoked_at, q.revision, q.status, c.case_reference, s.id AS submission_id, s.state, s.notification_status, s.last_error, s.confirmed_at FROM client_risk_questionnaires q JOIN brokerage_cases c ON c.id = q.case_id LEFT JOIN client_risk_submissions s ON s.questionnaire_id = q.id WHERE (? = '' OR q.case_id = ?) ORDER BY q.updated_at DESC, s.revision DESC LIMIT 100").bind(url.searchParams.get("case_id") || "", url.searchParams.get("case_id") || "").all();
    return qjson({ success: true, questionnaires: result.results });
  } catch (error) { return failure(error); }
}
export async function onRequestPost({ request, env }) {
  if (!adminRequestAllowed(request, env)) return qjson({ success: false, error: "Accès refusé" }, 401);
  try {
    const body = await request.json();
    if (body.action === "prepare_draft") {
      const mail = await first(env, "SELECT * FROM case_mail_queue WHERE id = ? AND status IN ('draft_review', 'approved')", String(body.mail_id || ""));
      if (!mail || !JSON.parse(mail.payload || "{}").questionnaire_submission_id) throw qerror("Brouillon introuvable", 404);
      const recipient = String(body.recipient || "").trim();
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient) || recipient.length > 180) throw qerror("Destinataire invalide", 422);
      const subject = String(body.subject || "").replace(/[\r\n]/g, " ").slice(0, 240), text = String(body.body || "").slice(0, 12000);
      if (!subject || !text) throw qerror("Objet et texte requis", 422);
      await run(env, "UPDATE case_mail_queue SET recipient_email = ?, subject = ?, body = ?, status = 'draft_review', approved_at = NULL, approved_by = NULL, updated_at = ? WHERE id = ?", recipient, subject, text, new Date().toISOString(), mail.id);
      await timeline(env, mail.case_id, "questionnaire_insurer_draft_updated", { mail_id: mail.id });
      return qjson({ success: true, status: "draft_review" });
    }
    if (body.action === "create") return qjson(await createQuestionnaire(env, body));
    if (body.action === "revoke") { const row = await first(env, "SELECT * FROM client_risk_questionnaires WHERE id = ?", body.id || ""); if (!row) throw qerror("Questionnaire introuvable", 404); await run(env, "UPDATE client_risk_questionnaires SET revoked_at = ?, updated_at = ? WHERE id = ?", new Date().toISOString(), new Date().toISOString(), row.id); await timeline(env, row.case_id, "questionnaire_access_revoked", { questionnaire_id: row.id }); return qjson({ success: true }); }
    if (body.action === "retry") { const row = await first(env, "SELECT * FROM client_risk_submissions WHERE id = ?", body.submission_id || ""); if (!row) throw qerror("Réponse introuvable", 404); if (row.notification_status === "failed") await run(env, "UPDATE client_risk_submissions SET notification_status = 'pending' WHERE id = ? AND notification_status = 'failed'", row.id); return qjson({ success: true, ...await processSubmission(env, row.id) }); }
    throw qerror("Action inconnue");
  } catch (error) { return failure(error); }
}
