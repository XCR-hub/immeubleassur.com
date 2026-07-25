const form = document.querySelector("#admin-form");
const tokenInput = document.querySelector("#admin-token");
const statusBox = document.querySelector(".form-status");
const body = document.querySelector("#leads-body");
const seoButton = document.querySelector("#load-seo");
const seoSummary = document.querySelector("#seo-summary");
const seoBody = document.querySelector("#seo-opportunities-body");
const leadSummary = document.querySelector("#lead-summary");
const leadSearch = document.querySelector("#lead-search");
const priorityFilter = document.querySelector("#lead-priority-filter");
const statusFilter = document.querySelector("#lead-status-filter");
const exportButton = document.querySelector("#export-leads");

let allLeads = [];
let latestLeadSummary = null;

if (tokenInput) tokenInput.value = sessionStorage.getItem("immeubleassur_admin_token") || "";

function setStatus(message, type = "") {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.className = `form-status ${type}`.trim();
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text || "";
  return td;
}

function priorityLabel(priority) {
  return ({ hot: "Chaud", warm: "A traiter", standard: "Standard", low: "A completer" })[priority] || "Standard";
}

const leadStatuses = [
  ["new", "Nouveau"],
  ["contacted", "Contacte"],
  ["quoted", "Devis envoye"],
  ["won", "Gagne"],
  ["lost", "Perdu"],
  ["archived", "Archive"]
];

function statusLabel(status) {
  const entry = leadStatuses.find(([value]) => value === status);
  return entry ? entry[1] : (status || "Nouveau");
}

function statusValue(lead) {
  return lead?.status || "new";
}

function isOpenLead(lead) {
  return !["won", "lost", "archived"].includes(statusValue(lead));
}

function hoursSince(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, (Date.now() - timestamp) / 3600000);
}

function followUpDue(lead) {
  const status = statusValue(lead);
  if (!isOpenLead(lead)) return false;
  const q = qualificationFor(lead);
  const createdAge = hoursSince(lead.created_at);
  const updatedAge = hoursSince(lead.updated_at || lead.created_at);
  if (status === "new" && q.priority === "hot") return createdAge >= 2;
  if (status === "new" && q.priority === "warm") return createdAge >= 6;
  if (status === "new" && q.priority === "standard") return createdAge >= 24;
  if (status === "new") return createdAge >= 48;
  if (status === "contacted") return updatedAge >= 24;
  if (status === "quoted") return updatedAge >= 72;
  return false;
}

function followUpLabel(lead) {
  if (!isOpenLead(lead)) return "Dossier cloture";
  if (followUpDue(lead)) return "Relance prioritaire";
  const status = statusValue(lead);
  if (status === "new") return "Premier rappel a planifier";
  if (status === "contacted") return "Suivi apres contact";
  if (status === "quoted") return "Devis a suivre";
  return "Suivi ouvert";
}

function unitCount(value) {
  return Number.parseInt(String(value || "0").replace(/\D/g, ""), 10) || 0;
}

function leadValueEstimate(lead, score = 0) {
  const units = Math.max(1, unitCount(lead.units_count));
  const need = String(lead.need || "").trim();
  const profile = String(lead.profile || "").trim();
  const propertyType = String(lead.property_type || "").trim();
  let base = 260;
  if (["multirisque-immeuble", "copropriete", "audit-contrat"].includes(need)) base = 520;
  if (["rc-syndic", "dommages-ouvrage"].includes(need)) base = 620;
  if (["pno", "cno", "pno-cno"].includes(need) || ["lot-copropriete", "logement-vacant", "logement-loue"].includes(propertyType)) base = units <= 2 ? 190 : 260;
  if (["local-commercial", "commerce", "mixte"].includes(propertyType)) base += 180;
  if (["sci", "administrateur-biens", "syndic-professionnel"].includes(profile)) base += 160;
  const min = Math.round(Math.max(180, base + Math.max(0, units - 1) * 135));
  const max = Math.round(min * (score >= 85 ? 1.75 : score >= 70 ? 1.55 : 1.35));
  const band = max >= 9000 ? "portfolio" : max >= 3500 ? "immeuble-prioritaire" : max >= 1200 ? "immeuble-standard" : "lot-pno-cno";
  return { annual_premium_min: min, annual_premium_max: max, band, label: `${min}-${max} EUR/an` };
}

function slaHoursFor(score, valueEstimate) {
  const maxValue = Number(valueEstimate?.annual_premium_max || 0);
  if (score >= 85 || maxValue >= 9000) return 2;
  if (score >= 70 || maxValue >= 3500) return 6;
  if (score >= 45 || maxValue >= 1200) return 24;
  return 48;
}

function formatEuro(value) {
  const amount = Number(value || 0);
  if (!amount) return "0 EUR";
  return `${Math.round(amount).toLocaleString("fr-FR")} EUR`;
}

function valueEstimateFor(lead, q = qualificationFor(lead)) {
  return q.value_estimate || leadValueEstimate(lead, q.score || 0);
}

function valueCell(lead, q) {
  const estimate = valueEstimateFor(lead, q);
  const td = document.createElement("td");
  td.className = "lead-value-cell";
  td.textContent = `${formatEuro(estimate.annual_premium_min)} - ${formatEuro(estimate.annual_premium_max)}\n${estimate.band || "standard"}\nSLA ${q.sla_hours || slaHoursFor(q.score || 0, estimate)}h`;
  return td;
}
function priorityCell(priority) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = `lead-priority ${String(priority || "standard").replace(/[^a-z0-9_-]/gi, "")}`;
  span.textContent = priorityLabel(priority);
  td.append(span);
  return td;
}

function statusCell(lead) {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  const select = document.createElement("select");
  const currentStatus = statusValue(lead);
  const values = new Set(leadStatuses.map(([value]) => value));
  wrap.className = "lead-status-control";
  select.dataset.leadStatus = lead.reference || "";
  select.setAttribute("aria-label", `Statut ${lead.reference || "lead"}`);

  if (!values.has(currentStatus)) {
    const option = document.createElement("option");
    option.value = currentStatus;
    option.textContent = statusLabel(currentStatus);
    select.append(option);
  }
  for (const [value, label] of leadStatuses) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    if (value === currentStatus) option.selected = true;
    select.append(option);
  }

  const button = document.createElement("button");
  button.className = "lead-status-save";
  button.type = "button";
  button.dataset.leadStatusSave = lead.reference || "";
  button.textContent = "OK";
  wrap.append(select, button);
  td.append(wrap);
  return td;
}

function followUpCell(lead, q) {
  const td = document.createElement("td");
  const wrap = document.createElement("div");
  const action = document.createElement("p");
  const signal = document.createElement("span");
  const assigned = document.createElement("input");
  const notes = document.createElement("textarea");
  const button = document.createElement("button");

  wrap.className = "lead-followup";
  action.className = "lead-next-action";
  action.textContent = q.next_action || "";
  signal.className = `lead-followup-signal${followUpDue(lead) ? " due" : ""}`;
  signal.textContent = followUpLabel(lead);

  assigned.className = "lead-assignee-input";
  assigned.placeholder = "Attribue a";
  assigned.value = lead.assigned_to || "";
  assigned.dataset.leadAssigned = lead.reference || "";
  assigned.setAttribute("aria-label", `Attribue a ${lead.reference || "lead"}`);

  notes.className = "lead-note-input";
  notes.placeholder = "Note interne";
  notes.value = lead.notes || "";
  notes.rows = 2;
  notes.dataset.leadNotes = lead.reference || "";
  notes.setAttribute("aria-label", `Note interne ${lead.reference || "lead"}`);

  button.className = "lead-followup-save";
  button.type = "button";
  button.dataset.leadFollowupSave = lead.reference || "";
  button.textContent = "Sauver suivi";

  wrap.append(action, signal, assigned, notes, button);
  td.append(wrap);
  return td;
}

function qualificationFor(lead) {
  const score = Number(lead.lead_score || 0);
  const valueEstimate = leadValueEstimate(lead, score);
  return lead.qualification || {
    score,
    priority: score >= 85 ? "hot" : score >= 70 ? "warm" : score >= 45 ? "standard" : "low",
    reasons: [],
    value_estimate: valueEstimate,
    sla_hours: slaHoursFor(score, valueEstimate),
    next_action: "Rappeler pour completer echeance, assureur actuel, surface et sinistres."
  };
}

function searchableText(lead) {
  const q = qualificationFor(lead);
  return [
    lead.reference,
    lead.name,
    lead.phone,
    lead.email,
    lead.profile,
    lead.property_type,
    lead.city,
    lead.need,
    lead.status,
    statusLabel(lead.status),
    lead.assigned_to,
    lead.notes,
    followUpLabel(lead),
    lead.message,
    q.priority,
    q.value_estimate?.label,
    q.value_estimate?.band,
    String(q.sla_hours || ""),
    q.reasons?.join(" "),
    q.next_action
  ].join(" ").toLowerCase();
}

function filteredLeads() {
  const query = (leadSearch?.value || "").trim().toLowerCase();
  const priority = priorityFilter?.value || "";
  const status = statusFilter?.value || "";
  return allLeads.filter((lead) => {
    const q = qualificationFor(lead);
    if (priority && q.priority !== priority) return false;
    if (status === "followup" && !followUpDue(lead)) return false;
    if (status && status !== "followup" && statusValue(lead) !== status) return false;
    if (query && !searchableText(lead).includes(query)) return false;
    return true;
  });
}

function render(rows) {
  if (!body) return;
  body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucun lead trouve.");
    td.colSpan = 13;
    tr.append(td);
    body.append(tr);
    return;
  }

  for (const lead of rows) {
    const q = qualificationFor(lead);
    const tr = document.createElement("tr");
    tr.dataset.priority = q.priority || "standard";
    tr.dataset.reference = lead.reference || "";
    tr.dataset.followup = followUpDue(lead) ? "due" : "ok";
    tr.append(
      cell(new Date(lead.created_at).toLocaleString("fr-FR")),
      cell(lead.reference),
      cell(`${lead.name}\n${lead.phone}\n${lead.email}`),
      priorityCell(q.priority),
      cell(lead.profile),
      cell(`${lead.property_type}${lead.units_count ? `\n${lead.units_count} lots` : ""}`),
      cell(lead.city),
      cell(lead.need),
      statusCell(lead),
      cell(`${q.score ?? lead.lead_score ?? ""}${q.reasons?.length ? `\n${q.reasons.slice(0, 4).join("\n")}` : ""}`),
      valueCell(lead, q),
      followUpCell(lead, q),
      cell(lead.message)
    );
    body.append(tr);
  }
}

function metricCard(label, value, detail = "") {
  const article = document.createElement("article");
  const strong = document.createElement("strong");
  const span = document.createElement("span");
  strong.textContent = value;
  span.textContent = detail ? `${label} - ${detail}` : label;
  article.append(strong, span);
  return article;
}

function countPriority(rows, priority) {
  return rows.filter((lead) => qualificationFor(lead).priority === priority).length;
}

function countStatus(rows, status) {
  return rows.filter((lead) => statusValue(lead) === status).length;
}

function countFollowUpDue(rows) {
  return rows.filter((lead) => followUpDue(lead)).length;
}

function countUnassignedOpen(rows) {
  return rows.filter((lead) => isOpenLead(lead) && !(lead.assigned_to || "").trim()).length;
}

function topLabel(items = []) {
  const first = items[0];
  return first ? `${first.label} (${first.count})` : "-";
}

function renderLeadSummary(summary = latestLeadSummary, visibleRows = filteredLeads()) {
  if (!leadSummary) return;
  const loaded = allLeads.length;
  const visible = visibleRows.length;
  const avg = summary?.average_score || 0;
  leadSummary.replaceChildren(
    metricCard("Leads affiches", String(visible), `${loaded} charges`),
    metricCard("Chauds", String(summary?.priority_counts?.hot ?? countPriority(allLeads, "hot")), "rappel prioritaire"),
    metricCard("A traiter", String(summary?.priority_counts?.warm ?? countPriority(allLeads, "warm")), "potentiel moyen/haut"),
    metricCard("Score moyen", String(avg || "-")),
    metricCard("Pipeline estime", summary?.pipeline_value?.label || "0 EUR/an", "dossiers ouverts"),
    metricCard("Valeur relance", summary?.followup_due_value?.label || "0 EUR/an", "relances dues"),
    metricCard("SLA 2h", String(summary?.sla_2h_count || 0), "rappel immediat"),
    metricCard("A relancer", String(summary?.followup_due_count ?? countFollowUpDue(visibleRows)), "priorite SLA"),
    metricCard("Sans pilote", String(summary?.unassigned_open_count ?? countUnassignedOpen(visibleRows)), "ouverts"),
    metricCard("Nouveaux", String(countStatus(visibleRows, "new")), "a rappeler"),
    metricCard("Devis", String(countStatus(visibleRows, "quoted")), "en cours"),
    metricCard("Gagnes", String(countStatus(visibleRows, "won")), "a mesurer"),
    metricCard("Besoin dominant", topLabel(summary?.top_needs)),
    metricCard("Ville dominante", topLabel(summary?.top_cities))
  );
}

function refreshLeadTable() {
  const rows = filteredLeads();
  render(rows);
  renderLeadSummary(latestLeadSummary, rows);
  setStatus(`${rows.length} lead(s) affiche(s) sur ${allLeads.length}.`, rows.length ? "ok" : "");
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function patchLead(reference, updates, button, successMessage) {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (!token) {
    setStatus("Token admin requis pour modifier un lead.", "error");
    return;
  }
  if (!reference) return;

  const previousLabel = button?.textContent || "OK";
  if (button) {
    button.disabled = true;
    button.textContent = "...";
  }

  try {
    const response = await fetch("/api/admin/leads", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reference, ...updates })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Mise a jour impossible");
    }

    const updated = result.lead || { reference, ...updates };
    allLeads = allLeads.map((lead) => lead.reference === reference ? { ...lead, ...updated } : lead);
    const rows = filteredLeads();
    render(rows);
    renderLeadSummary(latestLeadSummary, rows);
    setStatus(typeof successMessage === "function" ? successMessage(updated) : `${reference} mis a jour.`, "ok");
  } catch (error) {
    setStatus(error.message || "Erreur de mise a jour", "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousLabel;
    }
  }
}

async function updateLeadStatus(reference, status, button) {
  const lead = allLeads.find((item) => item.reference === reference) || {};
  await patchLead(reference, { status, assigned_to: lead.assigned_to || "", notes: lead.notes || "" }, button, (updated) => `${reference} passe en statut ${statusLabel(updated.status)}.`);
}

async function updateLeadFollowUp(reference, assignedTo, notes, button) {
  const lead = allLeads.find((item) => item.reference === reference) || {};
  await patchLead(reference, { status: statusValue(lead), assigned_to: assignedTo, notes }, button, () => `${reference} suivi commercial sauvegarde.`);
}

function exportVisibleLeads() {
  const rows = filteredLeads();
  const header = ["date", "reference", "priority", "score", "annual_premium_min", "annual_premium_max", "revenue_band", "sla_hours", "name", "phone", "email", "profile", "property_type", "city", "need", "status", "status_label", "assigned_to", "follow_up_due", "next_action", "reasons", "notes", "message", "updated_at"];
  const lines = [header.map(csvEscape).join(",")];
  for (const lead of rows) {
    const q = qualificationFor(lead);
    lines.push([
      lead.created_at,
      lead.reference,
      q.priority,
      q.score,
      valueEstimateFor(lead, q).annual_premium_min,
      valueEstimateFor(lead, q).annual_premium_max,
      valueEstimateFor(lead, q).band,
      q.sla_hours || slaHoursFor(q.score || 0, valueEstimateFor(lead, q)),
      lead.name,
      lead.phone,
      lead.email,
      lead.profile,
      lead.property_type,
      lead.city,
      lead.need,
      lead.status,
      statusLabel(lead.status),
      lead.assigned_to,
      followUpDue(lead) ? "yes" : "no",
      q.next_action,
      q.reasons?.join(" | "),
      lead.notes,
      lead.message,
      lead.updated_at
    ].map(csvEscape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `immeubleassur-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function renderSeoTable(rows) {
  if (!seoBody) return;
  seoBody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucune opportunite SEO chargee.");
    td.colSpan = 5;
    tr.append(td);
    seoBody.append(tr);
    return;
  }
  for (const item of rows.slice(0, 50)) {
    const tr = document.createElement("tr");
    tr.append(
      cell(String(item.score || item.page_score || "")),
      cell(item.opportunity_type || item.type || item.severity || "audit"),
      cell(item.url || ""),
      cell(item.query || item.message || ""),
      cell(item.recommendation || "")
    );
    seoBody.append(tr);
  }
}

async function fetchPublicSeoReport() {
  const response = await fetch("/assets/seo-autopilot-latest.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Rapport SEO public introuvable");
  return response.json();
}

function priorityCount(priorities = [], key) {
  const row = priorities.find((item) => item.priority === key);
  return Number(row?.count || 0);
}

async function loadSeo() {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (tokenInput && token) sessionStorage.setItem("immeubleassur_admin_token", token);
  if (seoSummary) seoSummary.replaceChildren(metricCard("Chargement", "SEO", "lecture des rapports"));

  let apiResult = null;
  if (token) {
    const response = await fetch("/api/admin/seo", { headers: { Authorization: `Bearer ${token}` } });
    apiResult = await response.json();
  }

  const publicReport = await fetchPublicSeoReport();
  const funnel = apiResult?.conversion_funnel || {};
  const leadStats = apiResult?.lead_stats || {};
  const expansion = publicReport.opportunity_expansion || {};
  const leadPriorities = apiResult?.lead_priorities || [];
  const ctaExperiments = apiResult?.cta_experiments || [];
  if (seoSummary) {
    seoSummary.replaceChildren(
      metricCard("Pages controlees", String(publicReport.pages_checked || 0)),
      metricCard("Score moyen", String(publicReport.average_score || 0)),
      metricCard("Opportunites", String(publicReport.opportunities_count || 0)),
      metricCard("Google feedback", String(publicReport.google_feedback_loop?.actions?.length || 0), publicReport.google_feedback_loop?.status || "monitoring"),
      metricCard("Qualite contenu", publicReport.content_quality?.status || "-", `${publicReport.content_quality?.warning_count || 0} alerte(s)`),
      metricCard("Potentiel lead", `${publicReport.conversion_intelligence?.average_money_score || 0}/100`, `${publicReport.conversion_intelligence?.money_pages_checked || 0} page(s) intention forte`),
      metricCard("Tests CTA", String(ctaExperiments.length), ctaExperiments[0] ? `${ctaExperiments[0].variant}: ${ctaExperiments[0].form_starts || 0} start(s)` : "en mesure"),
      metricCard("Actions leads", String(apiResult?.lead_actions?.length || 0), `${priorityCount(leadPriorities, "hot")} chaud(s)`),
      metricCard("Diagnostic", `${funnel.diagnostic_completion_rate || 0}%`, `${funnel.diagnostic_completes || 0} termine(s)`),
      metricCard("Dossier pret", `${funnel.readiness_completion_rate || 0}%`, `${funnel.readiness_completes || 0} valide(s)`),
      metricCard("Valeur affichee", `${funnel.value_hint_to_submit_rate || 0}%`, `${funnel.value_hint_ready || 0} signal(s)`),
      metricCard("Pages enrichies", String(expansion.pages_expanded || 0), `${expansion.words_added_estimate || 0} mots`),
      metricCard("Auto-fixes", String(publicReport.auto_fix?.fixes_applied || 0), `${publicReport.auto_fix?.pages_changed || 0} page(s)`),
      metricCard("Leads 30j", String(leadStats.leads_30d || 0), `score ${Math.round(leadStats.avg_score || 0)}`),
      metricCard("Leads chauds", String(leadStats.hot_leads_30d || 0), "score 80+"),
      metricCard("CTA -> formulaire", `${funnel.cta_to_form_rate || 0}%`, `${funnel.cta_clicks || 0} clics`),
      metricCard("Formulaire -> lead", `${funnel.form_to_lead_rate || 0}%`, `${funnel.form_starts || 0} starts`),
      metricCard("Abandons", `${funnel.abandon_rate || 0}%`, `${funnel.abandoned_forms || 0} signaux`)
    );
  }

  const fallbackRows = [
    ...(publicReport.google_feedback_loop?.actions || []).map((item) => ({ score: item.priority === "high" ? 90 : item.priority === "fix" ? 88 : item.priority === "setup" ? 80 : 55, opportunity_type: `google-${item.source || "feedback"}`, url: item.url || item.cluster || "google", query: item.priority || "monitoring", recommendation: item.action || "Mesurer et optimiser." })),
    ...(publicReport.conversion_intelligence?.actions || []).map((item) => ({ score: item.score || 0, opportunity_type: "conversion-intelligence", url: item.url || item.cluster || "money-page", query: item.priority || item.cluster || "lead", recommendation: item.action || "Renforcer le passage vers devis qualifie." })),
    ...(apiResult?.lead_actions || []),
    ...(ctaExperiments || []).slice(0, 6).map((item) => ({ score: item.leads_created || item.form_starts || item.cta_clicks || 0, opportunity_type: "test-cta", url: item.variant || "cta", query: `${item.views || 0} vues / ${item.cta_clicks || 0} clics / ${item.form_starts || 0} starts / ${Math.round(item.lead_value_max_total || 0)} EUR potentiel CTA`, recommendation: "Comparer les variantes avec les leads crees et leur valeur estimee avant de figer le message." })),
    ...(apiResult?.conversion_gaps || []).slice(0, 8).map((item) => ({ score: Number(item.form_starts || 0) - Number(item.leads_created || 0), opportunity_type: "conversion-gap", url: item.path, query: `${item.form_starts || 0} starts / ${item.leads_created || 0} leads`, recommendation: "Verifier intention, reassurance et friction formulaire sur cette page." })),
    ...(apiResult?.diagnostic_paths || []).slice(0, 8).map((item) => ({ score: item.completions, opportunity_type: "diagnostic", url: item.path, query: `${item.completions || 0} completions ${item.target || ""}`.trim(), recommendation: "Renforcer le CTA et le contenu du parcours diagnostic qui capte cette intention." })),
    ...(apiResult?.readiness_paths || []).slice(0, 8).map((item) => ({ score: item.completions, opportunity_type: "dossier-pret", url: item.path, query: `${item.completions || 0} dossiers, score ${Math.round(item.avg_score || 0)}%`, recommendation: "Renforcer les elements de preuve et le CTA formulaire sur les pages qui preparent le mieux le dossier." })),
    ...(apiResult?.value_hint_paths || []).slice(0, 8).map((item) => ({ score: item.completions, opportunity_type: "estimation-prime", url: item.path, query: `${item.completions || 0} affichages, potentiel ${Math.round(item.avg_value_max || 0)} EUR`, recommendation: "Renforcer le bloc prix, les preuves et le CTA devis sur les pages qui declenchent les meilleures estimations." })),
    ...(apiResult?.top_landing_pages || []).slice(0, 10).map((item) => ({ score: item.count, opportunity_type: "landing", url: item.landing_page, query: "trafic 30j", recommendation: "Surveiller le passage vers formulaire et lead." })),
    ...(apiResult?.leads_by_need || []).slice(0, 5).map((item) => ({ score: item.count, opportunity_type: "besoin", url: item.need, query: `score moyen ${Math.round(item.avg_score || 0)}`, recommendation: "Prioriser les contenus et CTA de ce besoin." })),
    ...(apiResult?.leads_by_city || []).slice(0, 5).map((item) => ({ score: item.count, opportunity_type: "ville", url: item.city, query: `score moyen ${Math.round(item.avg_score || 0)}`, recommendation: "Renforcer maillage local si la demande progresse." }))
  ];
  const rows = apiResult?.opportunities?.length ? [...(apiResult?.lead_actions || []), ...apiResult.opportunities] : ((publicReport.top_opportunities || []).length ? publicReport.top_opportunities : fallbackRows);
  renderSeoTable(rows);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;

  sessionStorage.setItem("immeubleassur_admin_token", token);
  setStatus("Chargement des leads...");

  try {
    const response = await fetch("/api/admin/leads", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Acces refuse");
    }
    allLeads = result.leads || [];
    latestLeadSummary = result.summary || null;
    if (leadSearch) leadSearch.value = "";
    if (priorityFilter) priorityFilter.value = "";
    if (statusFilter) statusFilter.value = "";
    refreshLeadTable();
    loadSeo().catch(() => {});
  } catch (error) {
    setStatus(error.message || "Erreur de chargement", "error");
  }
});

leadSearch?.addEventListener("input", refreshLeadTable);
priorityFilter?.addEventListener("change", refreshLeadTable);
statusFilter?.addEventListener("change", refreshLeadTable);
exportButton?.addEventListener("click", exportVisibleLeads);

body?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const statusButton = target.closest("[data-lead-status-save]");
  if (statusButton) {
    const row = statusButton.closest("tr");
    const select = row?.querySelector("[data-lead-status]");
    updateLeadStatus(statusButton.dataset.leadStatusSave || "", select?.value || "", statusButton);
    return;
  }

  const followUpButton = target.closest("[data-lead-followup-save]");
  if (followUpButton) {
    const row = followUpButton.closest("tr");
    const assigned = row?.querySelector("[data-lead-assigned]");
    const notes = row?.querySelector("[data-lead-notes]");
    updateLeadFollowUp(followUpButton.dataset.leadFollowupSave || "", assigned?.value || "", notes?.value || "", followUpButton);
  }
});

seoButton?.addEventListener("click", () => {
  loadSeo().catch((error) => {
    if (seoSummary) seoSummary.replaceChildren(metricCard("Erreur", "SEO", error.message || "chargement impossible"));
  });
});