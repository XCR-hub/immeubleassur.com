const $ = selector => document.querySelector(selector);
const status = $("#q-status"), workspace = $("#q-workspace"), fieldsBox = $("#q-fields");
const storageKey = "immeubleassur_questionnaire_access";
const fragment = new URLSearchParams(location.hash.slice(1));
let access = fragment.get("access") || sessionStorage.getItem(storageKey) || "";
if (fragment.has("access")) { history.replaceState(null, "", location.pathname); sessionStorage.setItem(storageKey, access); }
let data, answers = {}, step = 0, revision = 0, dirty = false, timer, idleTimer, saving = Promise.resolve(), submitting = false;
const endpoint = "/api/client/questionnaire";
function message(text, kind = "") { status.textContent = text; status.className = "q-status " + kind; }
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function closeAccess() { clearTimeout(timer); clearTimeout(idleTimer); sessionStorage.removeItem(storageKey); access = ""; answers = {}; data = null; dirty = false; fieldsBox.replaceChildren(); $("#q-documents").replaceChildren(); $("#q-reports").replaceChildren(); $("#q-reference").textContent = ""; workspace.hidden = true; message("Accès fermé. Pour reprendre, ouvrez votre lien personnel."); }
function activity() { clearTimeout(idleTimer); idleTimer = setTimeout(closeAccess, 30 * 60000); }
for (const event of ["click", "input", "keydown"]) document.addEventListener(event, activity, { passive: true });
$("#q-lock").addEventListener("click", closeAccess);
async function request(path = endpoint, options = {}) {
  const requestAccess = access;
  const response = await fetch(path, { ...options, headers: { Authorization: "Bearer " + access, ...(options.body ? { "Content-Type": "application/json" } : {}) }, cache: "no-store", credentials: "same-origin" });
  const body = await response.json().catch(() => ({}));
  if (!access || access !== requestAccess) throw new Error("Accès fermé.");
  if (!response.ok || body.success === false) { const error = new Error(body.error || "Une erreur est survenue. Réessayez."); error.status = response.status; throw error; }
  return body;
}
function answered(value) { return Array.isArray(value) ? value.length > 0 : value !== "" && value !== undefined && value !== null; }
function progress() {
  const all = data.sections.flatMap(section => section.fields), count = all.filter(field => answered(answers[field.id])).length;
  $("#q-progress").value = Math.round(count * 100 / all.length); $("#q-progress-label").textContent = count + " / " + all.length;
}
function changed() { dirty = true; $("#q-save-state").textContent = "Modifications à enregistrer"; progress(); clearTimeout(timer); if (!submitting) timer = setTimeout(() => save().catch(error => message(error.message, "error")), 1500); }
function control(field, value, onChange) {
  const label = node("label", undefined, "q-field" + (field.type === "textarea" ? " full" : "")); label.append(node("span", field.label + (field.required ? " *" : "")));
  let input;
  if (field.type === "choice") { input = node("select"); input.append(new Option("Choisir une réponse", "")); for (const [key, title] of field.options) input.append(new Option(title, key)); }
  else if (field.type === "textarea") { input = node("textarea"); input.rows = 3; input.maxLength = 6000; }
  else { input = node("input"); input.type = ["number", "date", "email", "tel"].includes(field.type) ? field.type : "text"; if (input.type === "number") { input.min = 0; input.step = "any"; if (field.max) input.max = field.max; } else input.maxLength = 600; }
  input.name = field.id; input.value = value ?? ""; input.required = field.required === true;
  input.addEventListener("input", () => { onChange(input.value); changed(); }); label.append(input); return label;
}
function rowControl(field) {
  const box = node("section", undefined, "q-rows"); box.append(node("h3", field.label));
  const rows = Array.isArray(answers[field.id]) ? answers[field.id] : [];
  const list = node("div");
  function draw() {
    list.replaceChildren();
    rows.forEach((row, index) => { const card = node("div", undefined, "q-row"), title = node("div", undefined, "q-row-title"); title.append(node("strong", "Ligne " + (index + 1))); const remove = node("button", "Retirer", "q-small"); remove.type = "button"; remove.addEventListener("click", () => { rows.splice(index, 1); answers[field.id] = rows; draw(); changed(); }); title.append(remove); card.append(title); for (const column of field.columns) card.append(control({ ...column, id: field.id + "-" + index + "-" + column.id }, row[column.id], value => { row[column.id] = value; answers[field.id] = rows; })); list.append(card); });
  }
  draw(); box.append(list); const add = node("button", "Ajouter une ligne", "q-secondary"); add.type = "button"; add.addEventListener("click", () => { if (rows.length >= field.maxRows) return; rows.push(Object.fromEntries(field.columns.map(column => [column.id, ""]))); answers[field.id] = rows; draw(); changed(); }); box.append(add); return box;
}
async function download(submissionId, index, filename) {
  const response = await fetch(endpoint + "?action=download&submission_id=" + encodeURIComponent(submissionId) + "&file=" + index, { headers: { Authorization: "Bearer " + access }, cache: "no-store" });
  if (!response.ok) throw new Error("Le document est encore en préparation.");
  const url = URL.createObjectURL(await response.blob()), link = node("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function renderReports() {
  const box = $("#q-reports"); box.replaceChildren();
  const latest = data.submissions?.find(item => item.state === "ready");
  if (!latest) return;
  box.append(node("h3", "Votre copie des réponses — version " + latest.revision));
  ["Rapport MMA (déclarations client)", "Annexe complète des réponses", "Questionnaire Word avec annexe"].forEach((title, index) => { const button = node("button", title, "q-secondary"); button.type = "button"; button.addEventListener("click", () => download(latest.id, index, `questionnaire-${data.case_reference}-${index}.${index === 2 ? "docx" : "pdf"}`).catch(error => message(error.message, "error"))); box.append(button); });
}
function renderDocuments() {
  const box = $("#q-documents"); box.replaceChildren(node("p", "Déposez les pièces disponibles. Vous pourrez compléter plus tard. PDF, JPG, PNG ou WebP, 6 Mo maximum par fichier. Une nouvelle version conserve la précédente."));
  for (const item of data.documents) {
    const card = node("article", undefined, "q-document"); card.append(node("h3", item.label)); card.append(node("p", item.file_name ? "Reçu : " + item.file_name + " · " + (item.status === "validated" ? "Vérifié" : "À relire par le conseiller") : "Aucun fichier déposé"));
    const input = node("input"); input.type = "file"; input.accept = ".pdf,.jpg,.jpeg,.png,.webp"; input.setAttribute("aria-label", "Déposer : " + item.label);
    input.addEventListener("change", async () => {
      const file = input.files[0]; if (!file) return;
      if (file.size > 6 * 1024 * 1024) { message("Le fichier dépasse 6 Mo.", "error"); input.value = ""; return; }
      input.disabled = true; message("Analyse et dépôt de la pièce en cours…");
      try { const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); }); await request(endpoint, { method: "POST", body: JSON.stringify({ action: "upload_document", document_type: item.type, file_name: file.name, mime_type: file.type, content_base64: encoded }) }); await save(); const payload = await request(); data.documents = payload.documents; renderDocuments(); message("Pièce reçue, en attente de lecture par votre conseiller.", "success"); } catch (error) { message(error.message, "error"); input.disabled = false; }
    }); card.append(input); box.append(card);
  }
}
function render() {
  const count = data.sections.length, documents = step === count, review = step === count + 1;
  $("#q-title").textContent = documents ? "Vos pièces justificatives" : review ? "Vérifiez et transmettez" : data.sections[step].title;
  $("#q-help").textContent = documents || review ? "" : data.sections[step].help || "Renseignez ce que vous connaissez et signalez les points à vérifier.";
  $("#q-step").textContent = `RUBRIQUE ${step + 1} / ${count + 2}`;
  fieldsBox.replaceChildren(); fieldsBox.hidden = documents || review; $("#q-documents").hidden = !documents; $("#q-review").hidden = !review;
  if (!documents && !review) for (const field of data.sections[step].fields) fieldsBox.append(field.type === "rows" ? rowControl(field) : control(field, answers[field.id], value => { answers[field.id] = value; }));
  if (documents) renderDocuments();
  if (review) { const all = data.sections.flatMap(section => section.fields), unknown = all.filter(field => !answered(answers[field.id]) || answers[field.id] === "unknown").length; $("#q-review-summary").textContent = `${unknown} rubriques restent à préciser, dont certaines peuvent être sans objet. Elles seront signalées au conseiller. Vous pouvez revenir aux étapes précédentes ou transmettre vos réponses pour revue.`; renderReports(); }
  $("#q-previous").hidden = step === 0; $("#q-next").hidden = review;
  $("#q-navigation").querySelectorAll("button").forEach((button, index) => { if (index === step) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current"); });
}
async function save() {
  clearTimeout(timer);
  saving = saving.catch(() => {}).then(async () => { if (!dirty) return; const snapshot = structuredClone(answers); $("#q-save-state").textContent = "Enregistrement…"; const result = await request(endpoint, { method: "POST", body: JSON.stringify({ action: "save", revision, answers: snapshot }) }); revision = result.revision; dirty = JSON.stringify(answers) !== JSON.stringify(snapshot); $("#q-save-state").textContent = dirty ? "Modifications à enregistrer" : "Enregistré à " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); });
  return saving;
}
$("#q-save").addEventListener("click", () => save().catch(error => message(error.message, "error")));
$("#q-next").addEventListener("click", () => { step++; render(); $("#q-title").scrollIntoView({ block: "start", behavior: "smooth" }); });
$("#q-previous").addEventListener("click", () => { step--; render(); });
$("#q-form").addEventListener("submit", event => event.preventDefault());
$("#q-submit").addEventListener("click", async () => {
  if (!$("#q-confirm").checked) { message("Confirmez la transmission à votre conseiller.", "error"); return; }
  submitting = true; $("#q-submit").disabled = true; message("Transmission de vos réponses et préparation de vos documents…");
  try { await save(); const result = await request(endpoint, { method: "POST", body: JSON.stringify({ action: "submit", answers, revision, confirmed: true }) }); revision = result.revision; const payload = await request(); data.submissions = payload.submissions; renderReports(); message(result.message, "success"); $("#q-save-state").textContent = "Réponses transmises"; }
  catch (error) { message(error.message, "error"); }
  finally { submitting = false; $("#q-submit").disabled = false; }
});
window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
async function start() {
  if (!/^[a-f0-9]{64}$/.test(access)) { closeAccess(); return; }
  try { data = await request(); answers = data.answers; revision = data.revision; $("#q-reference").textContent = `Dossier ${data.case_reference} · Lien valable jusqu’au ${new Date(data.expires_at).toLocaleDateString("fr-FR")}`; const nav = $("#q-navigation"); [...data.sections.map(section => section.title), "Pièces justificatives", "Vérifier et transmettre"].forEach((title, index) => { const button = node("button", `${String(index + 1).padStart(2, "0")}  ${title}`); button.type = "button"; button.addEventListener("click", () => { step = index; render(); }); nav.append(button); }); workspace.hidden = false; progress(); render(); activity(); message("Vos informations sont accessibles uniquement avec votre lien personnel."); }
  catch (error) { message(error.message, "error"); }
}
start();
