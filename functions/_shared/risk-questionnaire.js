import { encryptDocumentBase64, decryptDocumentBase64 } from "./document-crypto.js";
import { XCR_MAIL_SIGNATURE } from "./mail-signature.js";
import { QUESTIONNAIRE_VERSION, questionnaireSections, questionnaireDocuments, questionnaireFields, sanitizeAnswers, unresolvedAnswers } from "./immeuble-questionnaire-schema.js";

export const QUESTIONNAIRE_MARKER = "secure-risk-questionnaire-v1";
export const questionnaireHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive", "X-Content-Type-Options": "nosniff" };
export const qjson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...questionnaireHeaders, "Content-Type": "application/json; charset=utf-8" } });
export const first = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
export const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const now = () => new Date().toISOString();
export function qerror(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function checkedAnswers(value) { try { return sanitizeAnswers(value); } catch (error) { throw qerror(error.message, 422); } }
export async function tokenHash(token) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function encode(value) { const bytes = new TextEncoder().encode(JSON.stringify(value)); let text = ""; for (let index = 0; index < bytes.length; index += 16000) text += String.fromCharCode(...bytes.subarray(index, index + 16000)); return btoa(text); }
export async function seal(value, env) { const encrypted = await encryptDocumentBase64(encode(value), { ...env, DOCUMENT_ENCRYPTION_REQUIRED: "1" }); return JSON.stringify({ ...encrypted, storage_marker: encrypted.marker }); }
export async function unseal(value, env) { const encoded = await decryptDocumentBase64(JSON.parse(value || "{}"), env); if (!encoded) throw qerror("Le document sécurisé est indisponible.", 503); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)))); }
export async function timeline(env, caseId, event, payload = {}) { await run(env, "INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, ?, 'questionnaire', ?, ?)", crypto.randomUUID(), caseId, event, JSON.stringify({ marker: QUESTIONNAIRE_MARKER, ...payload }), now()); }

export async function questionnaireAccess(request, env) {
  if (!env.DB) throw qerror("Service indisponible", 503);
  const origin = request.headers.get("Origin");
  if (origin && !["https://immeubleassur.com", "https://www.immeubleassur.com", env.SITE_ORIGIN].includes(origin)) throw qerror("Origine refusée", 403);
  const ip = String(request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].slice(0, 120);
  const failures = await first(env, "SELECT COUNT(*) AS count FROM site_events WHERE event_type = 'risk_questionnaire_auth_failure' AND ip_address = ? AND created_at >= ?", ip, new Date(Date.now() - 5 * 60000).toISOString());
  if (Number(failures?.count || 0) >= 20) throw qerror("Trop de tentatives. Réessayez dans quelques minutes.", 429);
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const row = /^[a-f0-9]{64}$/.test(token) ? await first(env, `SELECT q.*, c.case_reference, c.client_portal_token, c.client_portal_token_revoked_at, l.name, l.city, l.status AS lead_status FROM client_risk_questionnaires q JOIN brokerage_cases c ON c.id = q.case_id JOIN leads l ON l.id = c.lead_id WHERE q.token_hash = ?`, await tokenHash(token)) : null;
  if (!row || row.revoked_at || row.client_portal_token_revoked_at || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now() || ["lost", "archived"].includes(row.lead_status)) {
    await run(env, "INSERT INTO site_events (id, event_type, page_url, target, payload, ip_address, created_at) VALUES (?, 'risk_questionnaire_auth_failure', '/questionnaire-immeuble', 'questionnaire', '{}', ?, ?)", crypto.randomUUID(), ip, now());
    throw qerror("Ce lien est invalide ou a expiré. Contactez votre conseiller.", 404);
  }
  return row;
}

export async function questionnaireView(env, row) {
  const answers = await unseal(row.answers_payload, env);
  const docs = await env.DB.prepare("SELECT id, document_type, label, status, payload FROM case_documents WHERE case_id = ? ORDER BY label").bind(row.case_id).all();
  const submissions = await env.DB.prepare("SELECT id, revision, state, notification_status, confirmed_at FROM client_risk_submissions WHERE questionnaire_id = ? ORDER BY revision DESC").bind(row.id).all();
  return { success: true, version: row.schema_version, case_reference: row.case_reference, expires_at: row.expires_at, revision: row.revision, status: row.status, sections: questionnaireSections, answers,
    documents: docs.results.map(doc => { let attachment; try { attachment = JSON.parse(doc.payload || "{}").attachment; } catch {} return { id: doc.id, type: doc.document_type, label: doc.label, status: doc.status, file_name: attachment?.file_name || "" }; }),
    submissions: submissions.results, unresolved: unresolvedAnswers(answers).length };
}

export async function createQuestionnaire(env, { case_id, answers: seed = {}, days = 30 }) {
  const dossier = await first(env, "SELECT c.*, l.name, l.email, l.phone, l.city, l.profile, l.units_count, l.status AS lead_status FROM brokerage_cases c JOIN leads l ON l.id = c.lead_id WHERE c.id = ?", String(case_id || ""));
  if (!dossier || ["lost", "archived", "won"].includes(dossier.lead_status)) throw qerror("Dossier actif introuvable", 404);
  const equipment = ["Extincteurs mobiles dans les étages", "Extincteurs mobiles dans les parkings", "Colonnes sèches ou humides", "Robinets d’incendie armés dans les étages", "Installations et protections contre l’incendie", "Robinets d’incendie armés dans les parkings", "Installations électriques des bureaux et commerces", "Thermographie infrarouge des installations électriques"].map(label => ({ equipment: label }));
  const answers = checkedAnswers({ representative_name: dossier.name || "", representative_email: dossier.email || "", representative_phone: dossier.phone || "", risk_city: dossier.city || "", representative_role: dossier.profile === "syndic-benevole" ? "benevole" : dossier.profile === "syndic-professionnel" ? "professionnel" : "", lots_count: Number.parseInt(dossier.units_count, 10) || "", prevention_equipment: equipment, ...seed });
  const id = crypto.randomUUID(), token = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  const encrypted = await seal(answers, env), created = now(), expires = new Date(Date.now() + Math.max(1, Math.min(30, Number(days) || 30)) * 86400000).toISOString();
  await run(env, "INSERT INTO client_risk_questionnaires (id, case_id, token_hash, expires_at, schema_version, answers_payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, dossier.id, await tokenHash(token), expires, QUESTIONNAIRE_VERSION, encrypted, created, created);
  for (const [type, label] of questionnaireDocuments) {
    if (!await first(env, "SELECT id FROM case_documents WHERE case_id = ? AND document_type = ?", dossier.id, type)) await run(env, "INSERT INTO case_documents (id, case_id, document_type, label, required, status, requested_at, payload, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'requested', ?, ?, ?, ?)", crypto.randomUUID(), dossier.id, type, label, created, JSON.stringify({ marker: QUESTIONNAIRE_MARKER }), created, created);
  }
  const url = `${String(env.SITE_ORIGIN || "https://immeubleassur.com").replace(/\/$/, "")}/questionnaire-immeuble#access=${token}`;
  const subject = `Votre dossier assurance immeuble – ${dossier.case_reference}`;
  const body = [`Bonjour ${dossier.name || ""},`, "", "Nous préparons l’étude de votre assurance immeuble. Pour éviter de vous redemander les éléments déjà communiqués, votre questionnaire est prérempli : vérifiez-les, complétez les rubriques et déposez les justificatifs disponibles.", "", url, "", "Vous pouvez enregistrer et reprendre plus tard. Si vous ne connaissez pas une réponse, indiquez-le sans faire d’estimation. Le bouton « Transmettre mes réponses » nous adressera le dossier pour vérification ; il ne souscrit aucune assurance.", "", `Ce lien personnel est valable jusqu’au ${new Date(expires).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}. Ne le transférez pas.`, "", "Les pièces utiles comprennent notamment le contrat actuel, le relevé des sinistres, le PV de désignation du syndic et le descriptif des surfaces et usages. Les rubriques du questionnaire précisent les autres pièces selon votre situation.", "", "Nous reviendrons vers vous après étude, avant toute transmission aux assureurs.", "", XCR_MAIL_SIGNATURE].join("\n");
  const mailId = crypto.randomUUID();
  await run(env, "INSERT INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, payload, created_at, updated_at) VALUES (?, ?, 'client', ?, ?, ?, 'draft_review', 1, ?, ?, ?)", mailId, dossier.id, dossier.email || "", subject, body, JSON.stringify({ marker: QUESTIONNAIRE_MARKER, purpose: "questionnaire_invitation", questionnaire_id: id }), created, created);
  await timeline(env, dossier.id, "questionnaire_invitation_prepared", { questionnaire_id: id, mail_id: mailId, expires_at: expires });
  return { success: true, id, url, expires_at: expires, mail_id: mailId, mail: { recipient: dossier.email, subject, body, status: "draft_review" } };
}

export async function saveQuestionnaire(env, row, input, expected) {
  if (!Number.isInteger(expected) || expected !== row.revision) throw qerror("Ce dossier a été modifié dans un autre onglet. Rechargez-le avant d’enregistrer.", 409);
  const answers = checkedAnswers(input);
  const previous = await unseal(row.answers_payload, env);
  if (JSON.stringify(previous) === JSON.stringify(answers)) return { row, answers };
  const encrypted = await seal(answers, env);
  const result = await run(env, "UPDATE client_risk_questionnaires SET answers_payload = ?, revision = revision + 1, status = 'draft', updated_at = ? WHERE id = ? AND revision = ? AND revoked_at = ''", encrypted, now(), row.id, expected);
  if (Number(result.meta?.changes || 0) !== 1) throw qerror("Enregistrement concurrent. Rechargez le questionnaire.", 409);
  return { row: { ...row, answers_payload: encrypted, revision: expected + 1, status: "draft" }, answers };
}

export async function processSubmission(env, submissionId) {
  let submission = await first(env, "SELECT s.*, c.case_reference, l.city, l.name FROM client_risk_submissions s JOIN brokerage_cases c ON c.id = s.case_id JOIN leads l ON l.id = c.lead_id WHERE s.id = ?", submissionId);
  if (!submission) throw qerror("Réponse introuvable", 404);
  if (submission.state === "queued" || submission.state === "failed") {
    const lock = await run(env, "UPDATE client_risk_submissions SET state = 'processing', last_error = NULL, updated_at = ? WHERE id = ? AND state IN ('queued', 'failed')", now(), submissionId);
    if (Number(lock.meta?.changes || 0) === 1) {
      try {
        if (typeof env.GENERATE_MMA_QUESTIONNAIRE !== "function") throw new Error("Générateur documentaire indisponible");
        const answers = await unseal(submission.answers_payload, env);
        const files = await env.GENERATE_MMA_QUESTIONNAIRE({ answers, reference: submission.case_reference, confirmed_at: submission.confirmed_at, submission_id: submission.id });
        if (!Array.isArray(files) || files.length < 2) throw new Error("Documents incomplets");
        const reports = await seal(files, env);
        await run(env, "UPDATE client_risk_submissions SET reports_payload = ?, state = 'ready', updated_at = ? WHERE id = ?", reports, now(), submission.id);
        const draftId = `questionnaire-insurer-${submission.id}`;
        await run(env, "INSERT OR IGNORE INTO case_mail_queue (id, case_id, audience, recipient_email, subject, body, status, review_required, payload, created_at, updated_at) VALUES (?, ?, 'insurer', '', ?, ?, 'draft_review', 1, ?, ?, ?)", draftId, submission.case_id, `Demande de cotation immeuble – ${submission.city || ""} – ${submission.case_reference}`, `Bonjour,\n\nMerci d’étudier le risque décrit dans le questionnaire et son annexe de réponses client, dossier ${submission.case_reference}.\n\nAvant l’envoi, le courtier doit vérifier les réponses, les pièces et les points restant à confirmer, puis sélectionner le destinataire.\n\n${XCR_MAIL_SIGNATURE}`, JSON.stringify({ marker: QUESTIONNAIRE_MARKER, questionnaire_submission_id: submission.id, attachments: files.map(file => ({ file_name: file.file_name, mime_type: file.mime_type })), human_review_required: true, unresolved_count: unresolvedAnswers(answers).length }), now(), now());
        await timeline(env, submission.case_id, "questionnaire_documents_prepared", { submission_id: submission.id, draft_id: draftId });
      } catch (error) {
        await run(env, "UPDATE client_risk_submissions SET state = 'failed', last_error = ?, updated_at = ? WHERE id = ?", String(error.message).slice(0, 300), now(), submission.id);
        return { state: "failed", notification_status: "pending" };
      }
    }
  }
  submission = await first(env, "SELECT s.*, c.case_reference FROM client_risk_submissions s JOIN brokerage_cases c ON c.id = s.case_id WHERE s.id = ?", submissionId);
  if (submission.state === "ready" && submission.notification_status === "pending" && typeof env.NOTIFY_MMA_QUESTIONNAIRE === "function") {
    const claimed = await run(env, "UPDATE client_risk_submissions SET notification_status = 'sending', notification_attempted_at = ?, updated_at = ? WHERE id = ? AND notification_status = 'pending'", now(), now(), submission.id);
    if (Number(claimed.meta?.changes || 0) === 1) {
      try {
        const files = await unseal(submission.reports_payload, env);
        const receipt = await env.NOTIFY_MMA_QUESTIONNAIRE({ reference: submission.case_reference, submission_id: submission.id, confirmed_at: submission.confirmed_at, files });
        await run(env, "UPDATE client_risk_submissions SET notification_status = 'sent', notification_sent_at = ?, notification_receipt = ?, last_error = NULL, updated_at = ? WHERE id = ?", now(), JSON.stringify(receipt || {}).slice(0, 2000), now(), submission.id);
      } catch (error) {
        await run(env, "UPDATE client_risk_submissions SET notification_status = 'failed', last_error = ?, updated_at = ? WHERE id = ?", String(error.message).slice(0, 300), now(), submission.id);
      }
    }
  }
  const result = await first(env, "SELECT state, notification_status FROM client_risk_submissions WHERE id = ?", submissionId);
  return result;
}

export async function submitQuestionnaire(env, row, body) {
  if (body.confirmed !== true) throw qerror("Confirmez la transmission des informations à votre courtier.", 422);
  const checked = checkedAnswers(body.answers);
  for (const field of questionnaireFields.filter(field => field.required)) if (!checked[field.id]) throw qerror("Champ à compléter : " + field.label, 422);
  const saved = await saveQuestionnaire(env, row, checked, body.revision);
  let submission = await first(env, "SELECT * FROM client_risk_submissions WHERE questionnaire_id = ? AND revision = ?", row.id, saved.row.revision);
  if (!submission) {
    const id = crypto.randomUUID(), created = now();
    await run(env, "INSERT OR IGNORE INTO client_risk_submissions (id, questionnaire_id, case_id, revision, answers_payload, confirmed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, row.id, row.case_id, saved.row.revision, saved.row.answers_payload, created, created, created);
    submission = await first(env, "SELECT * FROM client_risk_submissions WHERE questionnaire_id = ? AND revision = ?", row.id, saved.row.revision);
    await run(env, "UPDATE client_risk_questionnaires SET status = 'submitted', updated_at = ? WHERE id = ? AND revision = ?", created, row.id, saved.row.revision);
    await run(env, "UPDATE brokerage_cases SET human_review_required = 1, next_action = 'Relire les réponses du questionnaire, les pièces et les documents générés avant toute consultation assureur.', updated_at = ? WHERE id = ?", created, row.case_id);
    await timeline(env, row.case_id, "questionnaire_received", { submission_id: submission.id, revision: saved.row.revision, client_confirmation: true });
  }
  const state = await processSubmission(env, submission.id);
  return { success: true, submission_id: submission.id, revision: saved.row.revision, status: "submitted", ...state, message: "Vos réponses ont été reçues. Votre conseiller va les vérifier avant toute consultation assureur." };
}

export async function downloadQuestionnaire(env, submission, index) {
  if (!submission?.reports_payload) throw qerror("Document en préparation", 404);
  const files = await unseal(submission.reports_payload, env), file = files[Number(index)];
  if (!file) throw qerror("Document introuvable", 404);
  return new Response(Uint8Array.from(atob(file.content_base64), char => char.charCodeAt(0)), { headers: { ...questionnaireHeaders, "Content-Type": file.mime_type, "Content-Disposition": `attachment; filename="${file.file_name.replace(/[^a-zA-Z0-9._-]/g, "_")}"` } });
}
