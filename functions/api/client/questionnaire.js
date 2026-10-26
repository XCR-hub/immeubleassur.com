import { onRequestPost as casePost } from "./case.js";
import { questionnaireAccess, questionnaireView, qjson, qerror, first, saveQuestionnaire, submitQuestionnaire, downloadQuestionnaire } from "../../_shared/risk-questionnaire.js";
import { questionnaireDocuments } from "../../_shared/immeuble-questionnaire-schema.js";
const failure = error => qjson({ success: false, error: error.status ? error.message : "Service momentanément indisponible" }, error.status || 503);
export async function onRequestGet({ request, env }) {
  try {
    const row = await questionnaireAccess(request, env), url = new URL(request.url);
    if (url.searchParams.get("action") === "download") {
      const submission = await first(env, "SELECT * FROM client_risk_submissions WHERE id = ? AND questionnaire_id = ?", url.searchParams.get("submission_id") || "", row.id);
      return await downloadQuestionnaire(env, submission, url.searchParams.get("file") || 0);
    }
    return qjson(await questionnaireView(env, row));
  } catch (error) { return failure(error); }
}
export async function onRequestPost({ request, env }) {
  try {
    const row = await questionnaireAccess(request, env);
    const body = await request.json().catch(() => null);
    if (!body || JSON.stringify(body).length > 9 * 1024 * 1024) throw qerror("Contenu invalide", 413);
    if (body.action === "upload_document") {
      const type = String(body.document_type || "").split("__")[0];
      const existing = await first(env, "SELECT * FROM case_documents WHERE case_id = ? AND document_type = ?", row.case_id, body.document_type);
      if (!existing) throw qerror("Pièce inconnue", 404);
      const spec = questionnaireDocuments.find(([key]) => key === type) || [type, existing.label];
      if (JSON.parse(existing.payload || "{}").attachment) {
        const created = new Date().toISOString();
        body.document_type = type + "__" + crypto.randomUUID();
        await env.DB.prepare("INSERT INTO case_documents (id, case_id, document_type, label, required, status, requested_at, payload, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'requested', ?, '{}', ?, ?)").bind(crypto.randomUUID(), row.case_id, body.document_type, spec[1] + " — nouvelle version", created, created, created).run();
      }
      const delegated = new Request(new URL("/api/client/case", request.url), { method: "POST", headers: { Authorization: `Bearer ${row.client_portal_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, action: "case_document_upload" }) });
      return await casePost({ request: delegated, env });
    }
    if (body.action === "save") { const result = await saveQuestionnaire(env, row, body.answers, body.revision); return qjson({ success: true, revision: result.row.revision, status: result.row.status }); }
    if (body.action === "submit") return qjson(await submitQuestionnaire(env, row, body));
    throw qerror("Action inconnue");
  } catch (error) { return failure(error); }
}
