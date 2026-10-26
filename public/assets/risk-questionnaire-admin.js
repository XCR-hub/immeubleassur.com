const token = () => document.querySelector("#admin-token")?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
const make = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const panel = make("section"); panel.className = "plain-panel admin-seo-panel"; panel.id = "questionnaires-clients";
panel.append(make("h2", "Questionnaires immeuble sécurisés"), make("p", "Préparer un lien personnel, suivre les réponses, télécharger les documents et conserver les envois assureurs en revue humaine."));
const toolbar = make("div"); toolbar.className = "admin-toolbar";
const load = make("button", "Charger les questionnaires"); load.type = "button"; load.className = "submit-button"; toolbar.append(load); panel.append(toolbar);
const status = make("p"), content = make("div"); status.setAttribute("role", "status"); panel.append(status, content);
document.querySelector("main")?.append(panel);
async function api(path, body) { const response = await fetch(path, { method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + token(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store" }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || "Action impossible"); return result; }
async function download(id, file) { const response = await fetch(`/api/admin/questionnaires?action=download&submission_id=${encodeURIComponent(id)}&file=${file}`, { headers: { Authorization: "Bearer " + token() }, cache: "no-store" }); if (!response.ok) throw new Error("Document indisponible"); const url = URL.createObjectURL(await response.blob()); const link = make("a"); link.href = url; link.download = `questionnaire-${id}-${file}.${file === 2 ? "docx" : "pdf"}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
async function display() {
  status.textContent = "Chargement…";
  const [cases, questionnaires] = await Promise.all([api("/api/admin/cases"), api("/api/admin/questionnaires")]);
  content.replaceChildren();
  const form = make("form"), select = make("select"); select.setAttribute("aria-label", "Dossier actif");
  for (const row of cases.cases.filter(item => !["lost", "contract_active"].includes(item.stage))) { const option = make("option", `${row.case_reference} — ${row.lead?.city || ""}`); option.value = row.id; select.append(option); }
  const create = make("button", "Préparer l’invitation client"); create.type = "submit"; create.className = "button secondary"; form.className = "admin-toolbar"; form.append(select, create); content.append(form);
  form.addEventListener("submit", async event => { event.preventDefault(); create.disabled = true; try { const result = await api("/api/admin/questionnaires", { action: "create", case_id: select.value }); const box = make("div"); box.append(make("p", "Invitation enregistrée en brouillon dans le dossier. Lien personnel :")); const link = make("textarea"); link.readOnly = true; link.value = result.url; link.setAttribute("aria-label", "Lien personnel client"); link.style.width = "100%"; box.append(link); form.after(box); status.textContent = "Brouillon préparé ; aucun email envoyé."; } catch (error) { status.textContent = error.message; } finally { create.disabled = false; } });
  for (const row of questionnaires.questionnaires) {
    const item = make("article"); item.className = "portal-panel"; item.append(make("h3", row.case_reference), make("p", `${row.revoked_at ? "Accès révoqué" : row.status} · version ${row.revision} · accès jusqu’au ${new Date(row.expires_at).toLocaleDateString("fr-FR")}`));
    if (row.submission_id) { item.append(make("p", `Documents : ${row.state} · mail interne : ${row.notification_status}`)); if (row.state === "ready") ["Rapport MMA", "Réponses PDF", "Questionnaire Word"].forEach((label, file) => { const button = make("button", label); button.type = "button"; button.className = "button secondary"; button.addEventListener("click", () => download(row.submission_id, file).catch(error => { status.textContent = error.message; })); item.append(button); }); if (row.state === "failed" || row.notification_status === "failed") { const retry = make("button", "Reprendre la génération / notification interne"); retry.type = "button"; retry.addEventListener("click", async () => { await api("/api/admin/questionnaires", { action: "retry", submission_id: row.submission_id }); await display(); }); item.append(retry); } }
    if (!row.revoked_at) { const revoke = make("button", "Révoquer ce lien"); revoke.type = "button"; revoke.className = "button secondary"; revoke.addEventListener("click", async () => { if (!confirm("Fermer cet accès client ?")) return; await api("/api/admin/questionnaires", { action: "revoke", id: row.id }); await display(); }); item.append(revoke); }
    content.append(item);
  }
  const drafts = cases.mail_queue.filter(mail => { try { return JSON.parse(mail.payload || "{}").questionnaire_submission_id; } catch { return false; } });
  if (drafts.length) content.append(make("h3", "Brouillons assureurs à préparer"));
  for (const draft of drafts) {
    const editor = make("form"); editor.className = "portal-mini-form";
    const recipient = make("input"); recipient.type = "email"; recipient.required = true; recipient.value = draft.recipient_email || ""; recipient.setAttribute("aria-label", "Email de l’assureur"); recipient.placeholder = "Destinataire assureur à confirmer";
    const subject = make("input"); subject.value = draft.subject; subject.setAttribute("aria-label", "Objet du brouillon assureur");
    const body = make("textarea"); body.rows = 6; body.value = draft.body; body.setAttribute("aria-label", "Texte du brouillon assureur");
    const save = make("button", "Enregistrer le brouillon pour revue"); save.type = "submit"; save.className = "button secondary"; editor.append(recipient, subject, body, save);
    editor.addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/admin/questionnaires", { action: "prepare_draft", mail_id: draft.id, recipient: recipient.value, subject: subject.value, body: body.value }); status.textContent = "Brouillon enregistré. Approbation et envoi restent dans le centre dossiers."; } catch (error) { status.textContent = error.message; } }); content.append(editor);
  }
  status.textContent = `${questionnaires.questionnaires.length} entrée(s). Aucun envoi déclenché par ce chargement.`;
}
load.addEventListener("click", () => display().catch(error => { status.textContent = error.message; }));
