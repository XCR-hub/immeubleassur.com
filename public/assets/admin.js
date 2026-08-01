const form = document.querySelector("#admin-form");
const tokenInput = document.querySelector("#admin-token");
const statusBox = document.querySelector(".form-status");
const body = document.querySelector("#leads-body");
const seoButton = document.querySelector("#load-seo");
const seoSummary = document.querySelector("#seo-summary");
const seoBody = document.querySelector("#seo-opportunities-body");
const integrationsButton = document.querySelector("#load-integrations");
const integrationsSummary = document.querySelector("#integrations-summary");
const integrationsBody = document.querySelector("#integrations-body");
const newsletterButton = document.querySelector("#load-newsletter");
const newsletterSendButton = document.querySelector("#send-newsletter");
const newsletterSummary = document.querySelector("#newsletter-summary");
const newsletterBody = document.querySelector("#newsletter-body");
const contentButton = document.querySelector("#load-content");
const contentSummary = document.querySelector("#content-summary");
const contentBody = document.querySelector("#content-body");
const spamButton = document.querySelector("#load-spam");
const spamSummary = document.querySelector("#spam-summary");
const spamBody = document.querySelector("#spam-body");
const salesButton = document.querySelector("#load-sales");
const salesSummary = document.querySelector("#sales-summary");
const salesBody = document.querySelector("#sales-body");
const attributionButton = document.querySelector("#load-attribution");
const attributionSummary = document.querySelector("#attribution-summary");
const attributionBody = document.querySelector("#attribution-body");
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

function urgencyLabel(urgency) {
  return ({ immediate: "Urgence immediate", "this-month": "A traiter ce mois-ci", "quote-ready": "Devis a cadrer", standard: "Qualification standard" })[urgency] || "Qualification standard";
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

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "0 o";
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}

function monitorStatusLabel(monitor) {
  if (!monitor?.available) return "Indispo";
  return monitor.success ? "OK" : "Alerte";
}

function monitorDetail(monitor) {
  if (!monitor?.available) return "rapport absent";
  const total = Array.isArray(monitor.checks) ? monitor.checks.length : 0;
  const ok = Number(monitor.summary?.ok || 0);
  const age = monitor.age_minutes === null || monitor.age_minutes === undefined ? "-" : `${monitor.age_minutes} min`;
  return `${ok}/${total} checks, age ${age}`;
}

function monitorSignal(monitor) {
  if (!monitor?.available) return "rapport local non trouve";
  const failed = (monitor.checks || []).filter((item) => !item.ok).map((item) => item.name).slice(0, 3);
  return failed.length ? failed.join(", ") : `dernier OK ${reportDate(monitor.generated_at)}`;
}

function leadSlaStatusLabel(report) {
  if (!report?.available) return "Indispo";
  if (Number(report.summary?.due_now || 0) > 0) return "A traiter";
  return report.success ? "OK" : "Alerte";
}

function leadSlaDetail(report) {
  if (!report?.available) return "rapport absent";
  const due = Number(report.summary?.due_now || 0);
  const open = Number(report.summary?.open_leads || 0);
  const age = report.age_minutes === null || report.age_minutes === undefined ? "-" : `${report.age_minutes} min`;
  return `${due} relance(s) / ${open} ouvert(s), age ${age}`;
}

function leadSlaSignal(report) {
  if (!report?.available) return "rapport local non trouve";
  const due = report.due_leads || [];
  if (due.length) return due.slice(0, 3).map((lead) => `${lead.reference} ${lead.priority}`).join(", ");
  const next = Number(report.summary?.next_due_minutes || 0);
  return next ? `prochaine relance dans ${next} min` : `dernier OK ${reportDate(report.generated_at)}`;
}

function leadQualityStatusLabel(report) {
  if (!report?.available) return "Indispo";
  if (Number(report.summary?.critical_issues || 0) > 0) return "Critique";
  if (Number(report.summary?.high_issues || 0) > 0 || Number(report.summary?.quality_score || 0) < 85) return "A corriger";
  return report.success ? "OK" : "Alerte";
}

function leadQualityDetail(report) {
  if (!report?.available) return "rapport absent";
  const score = Number(report.summary?.quality_score || 0);
  const leads = Number(report.summary?.leads_period || 0);
  const issues = Number(report.summary?.issue_count || 0);
  return `${score}/100, ${issues} signal(s), ${leads} lead(s)`;
}

function leadQualitySignal(report) {
  if (!report?.available) return "rapport local non trouve";
  const issue = (report.issues || [])[0];
  if (issue) return `${issue.label || issue.type}: ${issue.count || 0}`;
  return `completude ${report.summary?.core_completion_rate || 0}%`;
}

function conversionFunnelStatusLabel(report) {
  if (!report?.available) return "Indispo";
  const critical = (report.recommendations || []).some((item) => item.severity === "critical");
  if (critical || report.attention_required) return "A corriger";
  if ((report.recommendations || []).some((item) => item.severity === "high")) return "A surveiller";
  return report.success ? "OK" : "Alerte";
}

function conversionFunnelDetail(report) {
  if (!report?.available) return "rapport absent";
  const summary = report.summary || {};
  const age = report.age_minutes === null || report.age_minutes === undefined ? "-" : `${report.age_minutes} min`;
  return `${summary.form_to_lead_rate || 0}% form->lead, ${summary.leads_db || 0} lead(s), age ${age}`;
}

function conversionFunnelSignal(report) {
  if (!report?.available) return "rapport local non trouve";
  const recommendation = (report.recommendations || [])[0];
  if (recommendation) return `${recommendation.path || "/"}: ${recommendation.signal || recommendation.type}`;
  const summary = report.summary || {};
  return `routeur ${summary.quote_continue_rate || 0}% / start ${summary.page_to_form_rate || 0}%`;
}
function intentConversionStatusLabel(report) {
  if (!report?.available) return "Indispo";
  if (Number(report.summary?.attention_count || 0) > 0 || report.attention_required) return "A traiter";
  if (report.status === "no-data" || report.status === "no-database") return "En mesure";
  return report.success ? "OK" : "Alerte";
}

function intentConversionDetail(report) {
  if (!report?.available) return "rapport absent";
  const summary = report.summary || {};
  const age = report.age_minutes === null || report.age_minutes === undefined ? "-" : `${report.age_minutes} min`;
  return `${summary.start_to_lead_rate || 0}% start->lead, ${summary.intents_with_leads || 0}/${summary.intent_count || 0} intent(s), age ${age}`;
}

function intentConversionSignal(report) {
  if (!report?.available) return "rapport local non trouve";
  const recommendation = (report.recommendations || [])[0];
  if (recommendation) return `${recommendation.target || "global"}: ${recommendation.signal || recommendation.type}`;
  const top = (report.intent_funnels || [])[0];
  if (top) return `${top.label || top.key}: ${top.leads_db || 0} lead(s), score ${top.average_lead_score || 0}`;
  return `intentions mesurees: ${report.summary?.intent_count || 0}`;
}
function seoBacklogStatusLabel(report) {
  if (!report?.available) return "Indispo";
  if (Number(report.summary?.critical_open || 0) > 0) return "Critique";
  if (Number(report.summary?.conversion_open || 0) > 0 || Number(report.summary?.old_open || 0) > 0) return "A traiter";
  if (Number(report.summary?.qualified_source_count || 0) > 0) return "A renforcer";
  return report.success ? "OK" : "Alerte";
}

function seoBacklogDetail(report) {
  if (!report?.available) return "rapport absent";
  const summary = report.summary || {};
  const age = report.age_minutes === null || report.age_minutes === undefined ? "-" : `${report.age_minutes} min`;
  return `${summary.open_opportunities || 0} ouvertes, ${summary.qualified_source_count || 0} source(s) qualifiee(s), age ${age}`;
}

function seoBacklogSignal(report) {
  if (!report?.available) return "rapport local non trouve";
  const recommendation = (report.recommendations || [])[0];
  if (recommendation) return `${recommendation.severity || "signal"}: ${recommendation.signal || recommendation.type}`;
  if (report.summary?.top_qualified_source) {
    const stage = report.summary.top_qualified_source_stage_label ? `${report.summary.top_qualified_source_stage_label} - ` : "";
    return Number(report.summary.top_qualified_source_leads || 0) > 0 ? `${stage}${report.summary.top_qualified_source}: ${report.summary.top_qualified_source_leads || 0} lead(s), score ${report.summary.top_qualified_source_score || 0}` : `${stage}${report.summary.top_qualified_source}: ${report.summary.top_qualified_source_sessions || 0} session(s), score ${report.summary.top_qualified_source_score || 0}`;
  }
  return `score moyen ${report.summary?.average_open_score || 0}, plus ancienne ${report.summary?.oldest_open_days || 0}j`;
}
function growthOpsStatusLabel(report) {
  if (!report?.reports_expected) return "Rapport";
  if (report.status === "critical") return "Critique";
  if (report.status === "action-required") return "A traiter";
  if (report.status === "no-data") return "En attente";
  return report.success === false ? "Alerte" : "OK";
}

function growthOpsDetail(report) {
  if (!report?.reports_expected) return "rapport public absent";
  return `${report.reports_available || 0}/${report.reports_expected || 0} rapport(s), ${report.attention_count || 0} attention`;
}

function growthOpsSignal(report) {
  const action = (report?.priority_actions || [])[0];
  if (action) return `${action.severity || "signal"}: ${action.signal || action.type}`;
  if (!report?.reports_expected) return "rapport public absent";
  const missing = report.missing_reports || [];
  if (missing.length) return `a brancher: ${missing.slice(0, 3).join(", ")}`;
  return `dernier OK ${reportDate(report.generated_at)}`;
}

function valueEstimateFor(lead, q = qualificationFor(lead)) {
  return q.value_estimate || leadValueEstimate(lead, q.score || 0);
}

function valueCell(lead, q) {
  const estimate = valueEstimateFor(lead, q);
  const td = document.createElement("td");
  td.className = "lead-value-cell";
  const urgency = q.urgency || { level: q.lead_urgency || "standard", reason: q.lead_urgency_reason || "information minimale" };
  td.textContent = `${formatEuro(estimate.annual_premium_min)} - ${formatEuro(estimate.annual_premium_max)}\n${estimate.band || "standard"}\nSLA ${q.sla_hours || slaHoursFor(q.score || 0, estimate)}h\n${urgencyLabel(urgency.level)}`;
  return td;
}
function leadOriginText(lead) {
  const parts = [];
  const kind = lead.content_kind ? ` ${lead.content_kind}` : "";
  if (String(lead.content_bridge || "") === "1") parts.push(`Pont contenu${kind}`);
  if (lead.source_path) parts.push(`Source: ${lead.source_path}`);
  if (lead.landing_path) parts.push(`Landing: ${lead.landing_path}`);
  if (lead.experiment_variant) parts.push(`CTA: ${lead.experiment_variant}`);
  if (!parts.length && lead.page_url) parts.push(`Page: ${lead.page_url}`);
  if (!parts.length && lead.source) parts.push(`Canal: ${lead.source}`);
  return parts.join("\n") || "-";
}

function leadOriginCell(lead) {
  const td = document.createElement("td");
  td.className = "lead-origin-cell";
  td.setAttribute("data-label", "Origine");
  td.textContent = leadOriginText(lead);
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
    urgency: { level: lead.lead_urgency || "standard", reason: lead.lead_urgency_reason || "information minimale" },
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
    lead.source,
    lead.page_url,
    lead.source_path,
    lead.landing_path,
    lead.content_bridge,
    lead.content_kind,
    lead.experiment_variant,
    leadOriginText(lead),
    lead.assigned_to,
    lead.notes,
    followUpLabel(lead),
    lead.message,
    q.priority,
    q.value_estimate?.label,
    q.value_estimate?.band,
    String(q.sla_hours || ""),
    q.urgency?.level,
    q.urgency?.reason,
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
    td.colSpan = 14;
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
      leadOriginCell(lead),
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

function topQualityLabel(items = []) {
  const first = items[0];
  return first ? `${first.label} (${first.hot || 0} chaud/${first.count || 0}, ${first.value_label || "0 EUR/an"})` : "-";
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
    metricCard("Ville dominante", topLabel(summary?.top_cities)),
    metricCard("Pont leads", String(summary?.content_bridge_count || 0), "issus du pont contenu"),
    metricCard("Source dominante", topLabel(summary?.top_source_paths), "origine SEO"),
    metricCard("Source qualifiee", topQualityLabel(summary?.top_source_quality), "score qualite")
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
  const header = ["date", "reference", "priority", "score", "annual_premium_min", "annual_premium_max", "revenue_band", "sla_hours", "lead_urgency", "lead_urgency_reason", "source_path", "landing_path", "content_bridge", "content_kind", "experiment_variant", "name", "phone", "email", "profile", "property_type", "city", "need", "status", "status_label", "assigned_to", "follow_up_due", "next_action", "reasons", "notes", "message", "updated_at"];
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
      q.urgency?.level || lead.lead_urgency || "standard",
      q.urgency?.reason || lead.lead_urgency_reason || "information minimale",
      lead.source_path,
      lead.landing_path,
      lead.content_bridge,
      lead.content_kind,
      lead.experiment_variant,
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

async function fetchOptionalAsset(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    return response.ok ? response.json() : {};
  } catch {
    return {};
  }
}

function reportDate(value) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return value || "-";
  return new Date(timestamp).toLocaleString("fr-FR");
}

function countConfigured(connectors = [], family = "") {
  return connectors.filter((item) => item.configured && (!family || item.family === family)).length;
}

function countFamily(connectors = [], family = "") {
  return connectors.filter((item) => !family || item.family === family).length;
}
function readinessConnectorId(connector) {
  if (!connector) return "";
  if (connector.family === "ia") return "editorial-ai";
  return connector.id || "";
}

function readinessFor(readinessReport = {}, connector = {}) {
  const id = readinessConnectorId(connector);
  return (readinessReport.rows || []).find((item) => item.id === id) || null;
}

function readinessLabel(row) {
  if (!row) return "-";
  return row.ready ? "Live pret" : "Fallback";
}

function eventCount(rows = [], eventType) {
  const row = rows.find((item) => item.event_type === eventType);
  return Number(row?.count || 0);
}

function subscriberCount(rows = [], status) {
  const row = rows.find((item) => item.status === status);
  return Number(row?.count || 0);
}

function connectorSignal(connector, reports, publicReports) {
  const { editorialReport, mediaReport, searchReport, seoReport, antifraudReport, turnstileReport, liveReadinessReport } = publicReports;
  const googleHealth = seoReport.google_api_health || {};
  if (connector.family === "ia") {
    const latest = reports.latest_ai_run;
    const reportProvider = editorialReport.ai_provider || "deterministic";
    const reportStatus = editorialReport.ai_status || editorialReport.status || "rapport public";
    if (latest) return `${latest.provider || reportProvider} / ${latest.status || reportStatus} - ${reportDate(latest.created_at)}`;
    return `${reportProvider} / ${reportStatus} - ${reportDate(editorialReport.generated_at)}`;
  }
  if (connector.id === "pexels") {
    const latest = reports.latest_media_run || {};
    const status = mediaReport.status || latest.status || "-";
    const count = mediaReport.assets_count ?? latest.assets_count ?? 0;
    return `${mediaReport.provider || latest.provider || "media"} / ${status} / ${count} asset(s)`;
  }
  if (connector.id === "serpapi") {
    const latest = reports.latest_search_run || {};
    const status = searchReport.status || latest.status || "-";
    const checked = searchReport.keywords_checked ?? latest.keywords_checked ?? 0;
    const firstPage = searchReport.first_page_count ?? latest.first_page_count ?? 0;
    return `${searchReport.provider || latest.provider || "serp"} / ${status} / ${firstPage}/${checked} page 1`;
  }
  if (connector.id === "google-search-console") {
    return `${googleHealth.search_console_rows || 0} lignes / ${googleHealth.url_inspection_checked || 0} inspections / ${googleHealth.sitemap_submitted ? "sitemap OK" : "sitemap attente"}`;
  }
  if (connector.id === "pagespeed") {
    return `${googleHealth.pagespeed_checked || 0} page(s) / ${googleHealth.pagespeed_slow_pages || 0} lente(s)`;
  }
  if (connector.id === "ga4") {
    return `${eventCount(reports.site_events_30d, "form_start")} starts / ${eventCount(reports.site_events_30d, "lead_created")} leads`;
  }
  if (connector.id === "smtp") {
    const issue = reports.latest_newsletter_issue;
    return `${subscriberCount(reports.newsletter_subscribers, "active")} abonne(s) actif(s) / dernier numero ${issue?.status || "-"}`;
  }
  if (connector.id === "local-antifraud") {
    return `${antifraudReport.status || "local"} / ${antifraudReport.forms_instrumented || 0}/${antifraudReport.forms_detected || 0} formulaire(s)`;
  }
  if (connector.id === "turnstile") {
    return `${turnstileReport.configured ? "actif" : "fallback local"} / ${turnstileReport.forms_instrumented || 0}/${turnstileReport.forms_detected || 0} formulaire(s)`;
  }
  if (connector.id === "admin-api") return "Token admin valide pour cette session";
  const readiness = readinessFor(liveReadinessReport, connector);
  if (readiness) return `${readinessLabel(readiness)} / ${readiness.configured_required || 0}/${readiness.required_count || 0} prerequis / ${readiness.last_report?.status || "rapport"}`;
  return connector.configured ? "secret detecte" : "secret manquant";
}

function connectorAction(connector) {
  if (connector.configured) return "Surveiller le prochain run et les conversions.";
  if (connector.missing_secret_names?.length) return `Configurer ${connector.missing_secret_names.join(", ")}.`;
  return "Verifier la configuration.";
}

function renderIntegrationsTable(rows) {
  if (!integrationsBody) return;
  integrationsBody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucun connecteur charge.");
    td.colSpan = 5;
    tr.append(td);
    integrationsBody.append(tr);
    return;
  }
  for (const item of rows) {
    const tr = document.createElement("tr");
    tr.append(
      cell(item.label || ""),
      cell(item.status || ""),
      cell(item.scope || ""),
      cell(item.signal || ""),
      cell(item.action || "")
    );
    integrationsBody.append(tr);
  }
}

async function loadIntegrations() {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (tokenInput && token) sessionStorage.setItem("immeubleassur_admin_token", token);
  if (integrationsSummary) integrationsSummary.replaceChildren(metricCard("Chargement", "API", "lecture des integrations"));

  const [editorialReport, mediaReport, searchReport, searchGapReport, seoReport, antifraudReport, turnstileReport, liveReadinessReport, growthOpsReport] = await Promise.all([
    fetchOptionalAsset("/assets/editorial-autopilot-latest.json"),
    fetchOptionalAsset("/assets/media-autopilot-latest.json"),
    fetchOptionalAsset("/assets/search-intelligence-latest.json"),
    fetchOptionalAsset("/assets/search-gap-booster-latest.json"),
    fetchOptionalAsset("/assets/seo-autopilot-latest.json"),
    fetchOptionalAsset("/assets/local-antifraud-latest.json"),
    fetchOptionalAsset("/assets/turnstile-hybrid-latest.json"),
    fetchOptionalAsset("/assets/live-api-readiness-latest.json"),
    fetchOptionalAsset("/assets/local-growth-ops-latest.json")
  ]);

  let apiResult = null;
  let runtimeHealth = null;
  if (token) {
    const response = await fetch("/api/admin/integrations", { headers: { Authorization: `Bearer ${token}` } });
    apiResult = await response.json();
    if (!response.ok || !apiResult.success) throw new Error(apiResult.error || "Audit integrations impossible");
    try {
      const runtimeResponse = await fetch("/api/admin/runtime-health", { headers: { Authorization: `Bearer ${token}` } });
      const runtimeResult = await runtimeResponse.json();
      if (runtimeResponse.ok && runtimeResult.success) runtimeHealth = runtimeResult;
    } catch {
      runtimeHealth = null;
    }
  }

  const connectors = apiResult?.connectors || [];
  const reports = apiResult?.reports || {};
  const publicReports = { editorialReport, mediaReport, searchReport, searchGapReport, seoReport, antifraudReport, turnstileReport, liveReadinessReport, growthOpsReport };
  const googleHealth = seoReport.google_api_health || {};
  const spamBlocks = Number(reports.lead_spam_blocks_30d || 0) + Number(reports.newsletter_spam_blocks_30d || 0);
  const duplicateLeads = Number(reports.lead_duplicates_30d || 0);

  if (integrationsSummary) {
    integrationsSummary.replaceChildren(
      metricCard("Connecteurs runtime", connectors.length ? `${countConfigured(connectors)}/${connectors.length}` : "Token requis", connectors.length ? "configuration locale verifiee" : "audit secrets protege"),
      metricCard("Live APIs", liveReadinessReport.connectors_checked ? `${liveReadinessReport.ready_count || 0}/${liveReadinessReport.connectors_checked}` : "Rapport", liveReadinessReport.status || "readiness"),
      metricCard("IA configurees", connectors.length ? `${countConfigured(connectors, "ia")}/${countFamily(connectors, "ia")}` : "-", `${editorialReport.ai_provider || "deterministic"} / ${editorialReport.ai_status || "public"}`),
      metricCard("Veille", editorialReport.mode || "-", `${editorialReport.watch_items || 0} signal(s), qualite ${editorialReport.quality_score || 0}`),
      metricCard("Pexels", mediaReport.pexels_enabled ? "Actif" : "Fallback", `${mediaReport.assets_count || 0} asset(s)`),
      metricCard("SerpApi", searchReport.serp_enabled ? "Actif" : "Fallback", `${searchReport.top3_count || 0} top 3 / ${searchReport.missing_count || 0} manquant(s)`),
      metricCard("Gaps SEO", String(searchGapReport.pages_boosted || 0), `${searchGapReport.candidates || 0} requete(s) renforcee(s)`),
      metricCard("Search Console", String(googleHealth.search_console_rows || 0), `${googleHealth.query_clusters || 0} cluster(s)`),
      metricCard("PageSpeed", String(googleHealth.pagespeed_checked || 0), `${googleHealth.pagespeed_slow_pages || 0} lente(s)`),
      metricCard("Newsletter", String(subscriberCount(reports.newsletter_subscribers, "active")), reports.latest_newsletter_issue?.status || "rapport public"),
      metricCard("Turnstile", turnstileReport.configured ? "Actif" : "Fallback", turnstileReport.configured ? `${turnstileReport.forms_instrumented || 0}/${turnstileReport.forms_detected || 0} formulaire(s)` : "filtre local"),
      metricCard("Anti-spam", String(spamBlocks || eventCount(reports.site_events_30d, "lead_spam_blocked")), antifraudReport.configured ? "filtre local actif" : "filtre local pret"),
      metricCard("Dedupe leads", String(duplicateLeads || eventCount(reports.site_events_30d, "lead_duplicate_filtered")), "doublons filtres"),
      metricCard("Growth ops", growthOpsStatusLabel(growthOpsReport), growthOpsDetail(growthOpsReport)),
      metricCard("Runtime", runtimeHealth ? `${runtimeHealth.runtime?.platform || "local"} / ${runtimeHealth.database?.driver || "db"}` : "Token requis", runtimeHealth?.database?.size_bytes ? `${runtimeHealth.database.table_count || 0} tables, ${formatBytes(runtimeHealth.database.size_bytes)}` : "diagnostic protege"),
      metricCard("Production", monitorStatusLabel(runtimeHealth?.monitor), monitorDetail(runtimeHealth?.monitor)),
      metricCard("SLA leads", leadSlaStatusLabel(runtimeHealth?.lead_sla), leadSlaDetail(runtimeHealth?.lead_sla)),
      metricCard("Qualite leads", leadQualityStatusLabel(runtimeHealth?.lead_quality), leadQualityDetail(runtimeHealth?.lead_quality)),
      metricCard("Funnel leads", conversionFunnelStatusLabel(runtimeHealth?.conversion_funnel), conversionFunnelDetail(runtimeHealth?.conversion_funnel)),
      metricCard("Intentions leads", intentConversionStatusLabel(runtimeHealth?.intent_conversion), intentConversionDetail(runtimeHealth?.intent_conversion)),
      metricCard("Backlog SEO", seoBacklogStatusLabel(runtimeHealth?.seo_backlog), seoBacklogDetail(runtimeHealth?.seo_backlog))
    );
  }

  const rows = connectors.length
    ? connectors.map((connector) => ({
      label: connector.label,
      status: readinessFor(liveReadinessReport, connector) ? readinessLabel(readinessFor(liveReadinessReport, connector)) : (connector.configured ? "Configure" : "A configurer"),
      scope: `${connector.scope}\nSecrets: ${connector.secret_names.join(", ")}`,
      signal: connectorSignal(connector, reports, publicReports),
      action: readinessFor(liveReadinessReport, connector)?.recommendation || connectorAction(connector)
    }))
    : [
      { label: "Admin API", status: "Token requis", scope: "Audit des secrets runtime protege.", signal: "Entrez le token admin.", action: "Charger avec ADMIN_API_TOKEN pour verifier les connecteurs." },
      { label: "Live API readiness", status: liveReadinessReport.status || "rapport public", scope: "Prerequis API live sans valeur secrete.", signal: liveReadinessReport.connectors_checked ? `${liveReadinessReport.ready_count || 0}/${liveReadinessReport.connectors_checked} connecteur(s) prets` : "rapport absent", action: "Configurer les variables manquantes dans .env.local ou sur le serveur puis lancer npm run seo:live." },
      { label: "Veille IA", status: editorialReport.ai_status || "rapport public", scope: "Dernier build editorial.", signal: `${editorialReport.ai_provider || "-"} - ${reportDate(editorialReport.generated_at)}`, action: "Configurer les secrets IA dans GitHub Actions pour activer un provider." },
      { label: "Pexels", status: mediaReport.status || "rapport public", scope: "Dernier build media.", signal: `${mediaReport.assets_count || 0} asset(s)`, action: "Configurer PEXELS_API_KEY pour injecter des visuels attribues." },
      { label: "SerpApi", status: searchReport.status || "rapport public", scope: "Dernier suivi positions.", signal: `${searchReport.keywords_checked || 0} requete(s)`, action: "Configurer SERP_API_KEY pour remplacer l'estimation locale." },
      { label: "Gaps recherche", status: searchGapReport.pages_boosted ? "Renforce" : "A surveiller", scope: "Pages hors top 3 estime enrichies automatiquement.", signal: `${searchGapReport.pages_boosted || 0}/${searchGapReport.candidates || 0} page(s)`, action: "Regenerer apres chaque suivi SERP pour renforcer les requetes business absentes ou hors top 3." }
    ];
  if (growthOpsReport?.reports_expected) {
    const action = growthOpsReport.priority_actions?.[0];
    rows.unshift({
      label: "Growth ops public",
      status: growthOpsStatusLabel(growthOpsReport),
      scope: `Rapports: ${growthOpsReport.reports_available || 0}/${growthOpsReport.reports_expected || 0}\nProtections: no PII`,
      signal: growthOpsSignal(growthOpsReport),
      action: action?.action || "Continuer la surveillance locale des leads, du SLA, du funnel et du backlog SEO/CRO."
    });
  }
  if (runtimeHealth?.monitor?.available) {
    rows.unshift({
      label: "Monitoring production",
      status: monitorStatusLabel(runtimeHealth.monitor),
      scope: `Site, /health, telemetry, SQLite\nAlertes: ${runtimeHealth.monitor.alert?.status || "-"}`,
      signal: monitorSignal(runtimeHealth.monitor),
      action: runtimeHealth.monitor.success ? "Continuer la surveillance planifiee toutes les 15 minutes." : "Ouvrir le rapport serveur et corriger le check en alerte."
    });
  }
  if (runtimeHealth?.seo_backlog?.available) {
    const recommendation = runtimeHealth.seo_backlog.recommendations?.[0];
    rows.unshift({
      label: "Backlog SEO/CRO",
      status: seoBacklogStatusLabel(runtimeHealth.seo_backlog),
      scope: `Ouvertes: ${runtimeHealth.seo_backlog.summary?.open_opportunities || 0}\nSources qualifiees: ${runtimeHealth.seo_backlog.summary?.qualified_source_count || 0}`,
      signal: seoBacklogSignal(runtimeHealth.seo_backlog),
      action: recommendation?.action || "Traiter les opportunites ouvertes par score avant de lancer de nouvelles optimisations."
    });
  }
  if (runtimeHealth?.conversion_funnel?.available) {
    const recommendation = runtimeHealth.conversion_funnel.recommendations?.[0];
    rows.unshift({
      label: "Funnel leads",
      status: conversionFunnelStatusLabel(runtimeHealth.conversion_funnel),
      scope: `Form->lead: ${runtimeHealth.conversion_funnel.summary?.form_to_lead_rate || 0}%\nRouteur: ${runtimeHealth.conversion_funnel.summary?.quote_continue_rate || 0}%`,
      signal: conversionFunnelSignal(runtimeHealth.conversion_funnel),
      action: recommendation?.action || "Continuer la mesure locale du tunnel et prioriser les pages a intention devis."
    });
  }
  if (runtimeHealth?.intent_conversion?.available) {
    const recommendation = runtimeHealth.intent_conversion.recommendations?.[0];
    rows.unshift({
      label: "Intentions leads",
      status: intentConversionStatusLabel(runtimeHealth.intent_conversion),
      scope: `Intentions: ${runtimeHealth.intent_conversion.summary?.intents_with_leads || 0}/${runtimeHealth.intent_conversion.summary?.intent_count || 0}\nUrgences: ${runtimeHealth.intent_conversion.summary?.lead_urgency_events || 0}`,
      signal: intentConversionSignal(runtimeHealth.intent_conversion),
      action: recommendation?.action || "Continuer le pilotage par intention SEO et renforcer les parcours qui generent des starts sans lead."
    });
  }
  if (runtimeHealth?.lead_quality?.available) {
    rows.unshift({
      label: "Qualite leads",
      status: leadQualityStatusLabel(runtimeHealth.lead_quality),
      scope: `Score: ${runtimeHealth.lead_quality.summary?.quality_score || 0}/100\nCompletude: ${runtimeHealth.lead_quality.summary?.core_completion_rate || 0}%`,
      signal: leadQualitySignal(runtimeHealth.lead_quality),
      action: runtimeHealth.lead_quality.issues?.[0]?.action || "Continuer le controle local de qualite des demandes."
    });
  }
  if (runtimeHealth?.lead_sla?.available) {
    rows.unshift({
      label: "SLA leads",
      status: leadSlaStatusLabel(runtimeHealth.lead_sla),
      scope: `Relances dues: ${runtimeHealth.lead_sla.summary?.due_now || 0}\nAlertes: ${runtimeHealth.lead_sla.alert?.status || "-"}`,
      signal: leadSlaSignal(runtimeHealth.lead_sla),
      action: Number(runtimeHealth.lead_sla.summary?.due_now || 0) > 0 ? "Traiter les references en retard dans le centre de relance commerciale." : "Conserver la surveillance locale des delais de rappel."
    });
  }
  if (runtimeHealth) {
    rows.unshift({
      label: "Serveur local",
      status: "OK",
      scope: `${runtimeHealth.runtime?.platform || "local-node"}\nBase ${runtimeHealth.database?.driver || "sqlite"}`,
      signal: `${runtimeHealth.database?.table_count || 0} table(s), ${formatBytes(runtimeHealth.database?.size_bytes)}`,
      action: "Surveiller /health public et sauvegardes SQLite planifiees."
    });
  }
  renderIntegrationsTable(rows);
}
function newsletterStat(rows = [], key) {
  const row = rows.find((item) => item.status === key || item.event_type === key);
  return Number(row?.count || 0);
}

function renderNewsletterTable(issues = [], watchItems = []) {
  if (!newsletterBody) return;
  newsletterBody.replaceChildren();
  const rows = [
    ...issues.slice(0, 12).map((issue) => ({
      type: "Numero",
      status: issue.status || "-",
      title: issue.title || issue.subject || "-",
      date: issue.sent_at || issue.published_at || issue.created_at || "",
      action: issue.html_url ? `Voir ${issue.html_url}` : "Preparer le prochain envoi"
    })),
    ...watchItems.slice(0, 12).map((item) => ({
      type: item.topic || "Veille",
      status: `score ${item.relevance_score || 0}`,
      title: item.title || "-",
      date: item.published_at || item.fetched_at || "",
      action: item.source_name ? `${item.source_name} - source publique` : "Source publique"
    }))
  ];

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucun signal newsletter charge.");
    td.colSpan = 5;
    tr.append(td);
    newsletterBody.append(tr);
    return;
  }

  for (const row of rows.slice(0, 24)) {
    const tr = document.createElement("tr");
    tr.append(
      cell(row.type),
      cell(row.status),
      cell(row.title),
      cell(reportDate(row.date)),
      cell(row.action)
    );
    newsletterBody.append(tr);
  }
}

async function loadNewsletter(message = "") {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (tokenInput && token) sessionStorage.setItem("immeubleassur_admin_token", token);
  if (!token) {
    if (newsletterSummary) newsletterSummary.replaceChildren(metricCard("Token requis", "Admin", "charger les donnees newsletter"));
    return;
  }
  if (newsletterSummary) newsletterSummary.replaceChildren(metricCard("Chargement", "Newsletter", "lecture SQLite"));

  const response = await fetch("/api/admin/newsletter", { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Chargement newsletter impossible");

  const issues = Array.isArray(result.issues) ? result.issues : [];
  const latest = issues[0] || {};
  const activeSubscribers = newsletterStat(result.subscriber_stats, "active");
  const unsubscribed = newsletterStat(result.subscriber_stats, "unsubscribed");
  const sent30d = newsletterStat(result.send_stats, "sent");
  const failed30d = newsletterStat(result.send_stats, "send_failed");

  if (newsletterSummary) {
    newsletterSummary.replaceChildren(
      metricCard("Abonnes actifs", String(activeSubscribers), `${unsubscribed} desinscrit(s)`),
      metricCard("Numeros", String(issues.length), latest.title || "dernier numero"),
      metricCard("SMTP", result.smtp_configured ? "Actif" : "A configurer", "envoi admin protege"),
      metricCard("Envoyes 30j", String(sent30d), `${failed30d} echec(s)`),
      metricCard("Veille", String((result.watch_items || []).length), "signaux editoriaux"),
      metricCard("Dernier envoi", latest.sent_at ? reportDate(latest.sent_at) : "Jamais", latest.status || "brouillon"),
      metricCard("Action", message || "Pret", latest.subject || "charger puis envoyer")
    );
  }
  renderNewsletterTable(issues, Array.isArray(result.watch_items) ? result.watch_items : []);
}

async function sendNewsletter() {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (!token) {
    if (newsletterSummary) newsletterSummary.replaceChildren(metricCard("Token requis", "Admin", "envoi impossible"));
    return;
  }
  if (!window.confirm("Envoyer le dernier numero de newsletter aux abonnes actifs ?")) return;

  const previousLabel = newsletterSendButton?.textContent || "Envoyer dernier numero";
  if (newsletterSendButton) {
    newsletterSendButton.disabled = true;
    newsletterSendButton.textContent = "Envoi...";
  }
  try {
    const response = await fetch("/api/admin/newsletter", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action: "send_latest" })
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error || "Envoi newsletter impossible");
    await loadNewsletter(`${result.sent || 0} envoye(s), ${result.failed || 0} echec(s)`);
  } catch (error) {
    if (newsletterSummary) newsletterSummary.replaceChildren(metricCard("Erreur", "Newsletter", error.message || "envoi impossible"));
  } finally {
    if (newsletterSendButton) {
      newsletterSendButton.disabled = false;
      newsletterSendButton.textContent = previousLabel;
    }
  }
}
function contentCount(rows = [], status = "") {
  return rows
    .filter((row) => !status || row.status === status)
    .reduce((sum, row) => sum + Number(row.count || 0), 0);
}

function contentActionRows(result = {}) {
  const actions = Array.isArray(result.content_actions) ? result.content_actions : [];
  if (actions.length) {
    return actions.map((item) => ({
      type: item.type || "action-contenu",
      score: item.score ?? item.priority ?? "",
      target: item.target || "",
      signal: item.signal || "",
      action: item.recommendation || "Renforcer le contenu et le passage vers devis."
    }));
  }

  const freshPages = Array.isArray(result.fresh_pages) ? result.fresh_pages : [];
  return freshPages.slice(0, 24).map((page) => ({
    type: `publie-${page.category || "contenu"}`,
    score: page.quality_score || "",
    target: page.slug || "",
    signal: page.updated_at ? `mis a jour ${reportDate(page.updated_at)}` : page.status || "publie",
    action: `Surveiller impressions, CTR et demandes de devis sur ${page.title || page.slug}.`
  }));
}

function renderContentTable(rows = []) {
  if (!contentBody) return;
  contentBody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucune action contenu chargee.");
    td.colSpan = 5;
    tr.append(td);
    contentBody.append(tr);
    return;
  }

  for (const row of rows.slice(0, 50)) {
    const tr = document.createElement("tr");
    tr.append(
      cell(row.type),
      cell(String(row.score ?? "")),
      cell(row.target),
      cell(row.signal),
      cell(row.action)
    );
    contentBody.append(tr);
  }
}

async function loadContent() {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (tokenInput && token) sessionStorage.setItem("immeubleassur_admin_token", token);
  if (!token) {
    if (contentSummary) contentSummary.replaceChildren(metricCard("Token requis", "Admin", "charger le pipeline contenu"));
    return;
  }
  if (contentSummary) contentSummary.replaceChildren(metricCard("Chargement", "Contenu", "lecture SQLite"));

  const response = await fetch("/api/admin/content", { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Chargement contenu impossible");

  const summary = result.summary || {};
  const pipelineStats = Array.isArray(result.pipeline_stats) ? result.pipeline_stats : [];
  const lowQualityPages = Array.isArray(result.low_quality_pages) ? result.low_quality_pages : [];
  const opportunities = Array.isArray(result.top_opportunities) ? result.top_opportunities : [];
  const watchItems = Array.isArray(result.watch_items) ? result.watch_items : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  if (contentSummary) {
    contentSummary.replaceChildren(
      metricCard("Pages pipeline", String(summary.pipeline_pages || contentCount(pipelineStats)), `${contentCount(pipelineStats, "published")} publiee(s)`),
      metricCard("Qualite moyenne", `${summary.average_quality || 0}/100`, `${summary.low_quality_pages ?? lowQualityPages.length} page(s) sous 80`),
      metricCard("Opportunites SEO", String(summary.open_opportunities ?? opportunities.length), "ouvertes dans SQLite"),
      metricCard("Veille editoriale", String(summary.watch_items ?? watchItems.length), "signaux classes"),
      metricCard("Dernier run SEO", result.latest_seo_run ? reportDate(result.latest_seo_run.created_at) : "Aucun", result.latest_seo_run?.status || "import SQLite"),
      metricCard("Dernier run IA", result.latest_ai_run ? reportDate(result.latest_ai_run.created_at) : "Aucun", result.latest_ai_run?.provider || "generation"),
      metricCard("Positions", result.latest_search_run ? `${result.latest_search_run.first_page_count || 0} top 10` : "Aucun", result.latest_search_run?.status || "SerpApi/Search"),
      metricCard("Media", result.latest_media_run ? `${result.latest_media_run.assets_count || 0} asset(s)` : "Aucun", result.latest_media_run?.provider || "visuels"),
      metricCard("Actions", String((result.content_actions || []).length), warnings.length ? `${warnings.length} alerte(s)` : "priorisees")
    );
  }
  renderContentTable(contentActionRows(result));
}
function salesRows(result = {}) {
  const rows = [];
  for (const item of Array.isArray(result.sales_actions) ? result.sales_actions : []) {
    rows.push({
      type: item.type || "action-commerciale",
      lead: item.target || "pipeline",
      value: String(item.priority || ""),
      signal: item.signal || "priorite commerciale",
      action: item.recommendation || "Traiter la relance prioritaire."
    });
  }
  for (const lead of Array.isArray(result.relance_leads) ? result.relance_leads.slice(0, 40) : []) {
    const duplicate = lead.duplicate_followup || null;
    rows.push({
      type: duplicate ? "retour-prospect" : lead.due ? "relance-sla" : "pipeline-ouvert",
      lead: `${lead.reference || "-"}\n${lead.name || ""}`,
      value: `${lead.value_estimate?.label || "0 EUR/an"}\n${lead.priority || "standard"}${duplicate ? `\n${duplicate.count || 0} renvoi(s)` : ""}`,
      signal: duplicate ? `${lead.city || "-"} - ${lead.need || "besoin"}\nDernier retour ${reportDate(duplicate.last_duplicate_at)} - ${duplicate.reason || "doublon"}` : `${lead.city || "-"} - ${lead.need || "besoin"}\n${lead.due_label || "SLA"}`,
      action: duplicate ? `Rappeler avant refroidissement: le prospect a renvoye une demande sur ce dossier.\n${lead.next_action || "Verifier le dossier."}\nSource: ${duplicate.path || lead.page_url || "/"}` : `${lead.next_action || "Rappeler le prospect."}\nScripts de rappel: ${lead.call_script || "Verifier le dossier."}\nEmail: ${lead.email_subject || "Relance devis"}`
    });
  }
  for (const item of Array.isArray(result.quote_followups) ? result.quote_followups : []) {
    rows.push({
      type: "devis-assureur",
      lead: item.response_status || "pending",
      value: `${item.count || 0} demande(s)`,
      signal: item.oldest_requested_at ? `depuis ${reportDate(item.oldest_requested_at)}` : "a suivre",
      action: "Relancer les assureurs et noter la reponse pour garder le pipeline mesurable."
    });
  }
  for (const item of Array.isArray(result.needs) ? result.needs.slice(0, 6) : []) {
    rows.push({
      type: "besoin-dominant",
      lead: item.need || "non precise",
      value: `${item.count || 0} lead(s)`,
      signal: `score moyen ${Math.round(Number(item.avg_score || 0))}`,
      action: "Adapter le script commercial et le contenu SEO autour de ce besoin."
    });
  }
  for (const item of Array.isArray(result.cities) ? result.cities.slice(0, 6) : []) {
    rows.push({
      type: "zone-active",
      lead: item.city || "non precise",
      value: `${item.count || 0} lead(s)`,
      signal: `score moyen ${Math.round(Number(item.avg_score || 0))}`,
      action: "Prioriser la relance locale puis renforcer le maillage ville si la demande progresse."
    });
  }
  return rows;
}

function renderSalesTable(rows = []) {
  if (!salesBody) return;
  salesBody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucune relance commerciale chargee.");
    td.colSpan = 5;
    tr.append(td);
    salesBody.append(tr);
    return;
  }

  for (const row of rows.slice(0, 80)) {
    const tr = document.createElement("tr");
    tr.append(
      cell(row.type),
      cell(row.lead),
      cell(row.value),
      cell(row.signal),
      cell(row.action)
    );
    salesBody.append(tr);
  }
}

async function loadSales() {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (tokenInput && token) sessionStorage.setItem("immeubleassur_admin_token", token);
  if (!token) {
    if (salesSummary) salesSummary.replaceChildren(metricCard("Token requis", "Admin", "charger les relances"));
    return;
  }
  if (salesSummary) salesSummary.replaceChildren(metricCard("Chargement", "Relances", "lecture SQLite"));

  const response = await fetch("/api/admin/sales", { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Chargement relances impossible");

  const summary = result.summary || {};
  const relanceLeads = Array.isArray(result.relance_leads) ? result.relance_leads : [];
  const duplicateFollowups = Array.isArray(result.duplicate_followups) ? result.duplicate_followups : [];
  const actions = Array.isArray(result.sales_actions) ? result.sales_actions : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const topLead = relanceLeads[0] || null;

  if (salesSummary) {
    salesSummary.replaceChildren(
      metricCard("Leads ouverts", String(summary.open_leads || 0), "90 derniers jours"),
      metricCard("Relances dues", String(summary.due_now || 0), summary.due_value?.label || "0 EUR/an"),
      metricCard("Retours prospect", String(summary.duplicate_followups || duplicateFollowups.length), summary.duplicate_followup_value?.label || "dossier existant"),
      metricCard("A 24h", String(summary.due_24h || 0), "a securiser"),
      metricCard("Leads chauds", String(summary.hot_open || 0), "rappel prioritaire"),
      metricCard("Sans pilote", String(summary.unassigned_open || 0), "assignation"),
      metricCard("Portefeuilles", String(summary.portfolio_open || 0), "forte valeur"),
      metricCard("Pipeline", summary.pipeline_value?.label || "0 EUR/an", "prime estimee"),
      metricCard("Top relance", topLead?.reference || "-", topLead?.due_label || "aucune"),
      metricCard("Actions", String(actions.length), warnings.length ? `${warnings.length} alerte(s)` : "priorisees")
    );
  }
  renderSalesTable(salesRows(result));
}
function attributionRows(result = {}) {
  const rows = [];
  for (const item of Array.isArray(result.actions) ? result.actions : []) {
    rows.push({
      type: item.type || "action-attribution",
      source: item.target || "acquisition",
      traffic: String(item.priority || ""),
      conversion: item.signal || "signal priorise",
      action: item.recommendation || "Analyser la source et renforcer le parcours lead."
    });
  }

  const attribution = result.attribution || {};
  const groups = [
    ["source qualifiee", attribution.source_quality || []],
    ["source", attribution.sources || []],
    ["landing", attribution.landing_pages || []],
    ["campagne", attribution.campaigns || []],
    ["besoin", attribution.needs || []],
    ["page", attribution.paths || []]
  ];
  for (const [type, items] of groups) {
    for (const item of Array.isArray(items) ? items.slice(0, 8) : []) {
      rows.push({
        type,
        source: item.key || "non precise",
        traffic: `${item.page_views || 0} vues\n${item.form_starts || 0} start(s)\n${item.form_abandons || 0} abandon(s)`,
        conversion: `${item.leads || 0} lead(s), ${item.hot_leads || 0} chaud(s)\n${item.value_label || "0 EUR/an"}`,
        action: `CTA ${item.cta_rate || 0}% / start ${item.start_rate || 0}% / abandon ${item.abandon_rate || 0}% / lead ${item.lead_rate || 0}%. Score moyen ${Math.round(Number(item.avg_score || 0))}.`
      });
    }
  }
  return rows;
}

function renderAttributionTable(rows = []) {
  if (!attributionBody) return;
  attributionBody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucun signal d'attribution charge.");
    td.colSpan = 5;
    tr.append(td);
    attributionBody.append(tr);
    return;
  }

  for (const row of rows.slice(0, 80)) {
    const tr = document.createElement("tr");
    tr.append(
      cell(row.type),
      cell(row.source),
      cell(row.traffic),
      cell(row.conversion),
      cell(row.action)
    );
    attributionBody.append(tr);
  }
}

async function loadAttribution() {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (tokenInput && token) sessionStorage.setItem("immeubleassur_admin_token", token);
  if (!token) {
    if (attributionSummary) attributionSummary.replaceChildren(metricCard("Token requis", "Admin", "charger l'attribution"));
    return;
  }
  if (attributionSummary) attributionSummary.replaceChildren(metricCard("Chargement", "Attribution", "lecture SQLite"));

  const response = await fetch("/api/admin/attribution", { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Chargement attribution impossible");

  const summary = result.summary || {};
  const attribution = result.attribution || {};
  const sources = Array.isArray(attribution.sources) ? attribution.sources : [];
  const qualitySources = Array.isArray(attribution.source_quality) ? attribution.source_quality : [];
  const landings = Array.isArray(attribution.landing_pages) ? attribution.landing_pages : [];
  const campaigns = Array.isArray(attribution.campaigns) ? attribution.campaigns : [];
  const needs = Array.isArray(attribution.needs) ? attribution.needs : [];
  const actions = Array.isArray(result.actions) ? result.actions : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  if (attributionSummary) {
    attributionSummary.replaceChildren(
      metricCard("Vues 30j", String(summary.page_views_30d || 0), "trafic mesure"),
      metricCard("Starts", String(summary.form_starts_30d || 0), `${summary.form_to_lead_rate || 0}% vers lead`),
      metricCard("Abandons", String(summary.form_abandons_30d || 0), `${summary.form_abandon_rate || 0}% abandon/start`),
      metricCard("Leads 30j", String(summary.leads_30d || 0), `${summary.hot_leads_30d || 0} chaud(s)`),
      metricCard("Visiteur -> lead", `${summary.visitor_to_lead_rate || 0}%`, "global"),
      metricCard("Top source", summary.top_source || "-", summary.top_source_value || "0 EUR/an"),
      metricCard("Source qualifiee", summary.top_quality_source || "-", summary.top_quality_source_signal || "score qualite"),
      metricCard("Top landing", summary.top_landing_page || "-", "valeur estimee"),
      metricCard("Top besoin", summary.top_need || "-", "intention"),
      metricCard("Sources", String(sources.length), `${qualitySources.length} qualifiee(s)`),
      metricCard("Landings", String(landings.length), "pages"),
      metricCard("Campagnes", String(campaigns.length), "UTM"),
      metricCard("Besoins", String(needs.length), "segments"),
      metricCard("Actions", String(actions.length), warnings.length ? `${warnings.length} alerte(s)` : "priorisees")
    );
  }
  renderAttributionTable(attributionRows(result));
}
function spamRows(result = {}) {
  const rows = [];
  for (const item of Array.isArray(result.actions) ? result.actions : []) {
    rows.push({
      type: item.type || "action-spam",
      volume: String(item.priority || ""),
      signal: item.signal || "",
      last: "priorite",
      action: item.recommendation || "Surveiller le filtre anti-spam."
    });
  }
  for (const item of Array.isArray(result.top_reasons) ? result.top_reasons : []) {
    rows.push({
      type: item.event_type || "raison",
      volume: `${item.blocked || 0} blocage(s)` ,
      signal: item.reason || "anti-spam",
      last: reportDate(item.last_seen),
      action: `Score max ${Math.round(Number(item.max_score || 0))}. Ajuster les seuils seulement si des vrais prospects sont touches.`
    });
  }
  for (const item of Array.isArray(result.top_paths) ? result.top_paths : []) {
    rows.push({
      type: "page-ciblee",
      volume: `${item.blocked || 0} blocage(s)`,
      signal: item.path || "/",
      last: reportDate(item.last_seen),
      action: `${item.lead_blocks || 0} lead / ${item.newsletter_blocks || 0} newsletter. Verifier filtre local et champs pieges.`
    });
  }
  for (const item of Array.isArray(result.repeat_sources) ? result.repeat_sources : []) {
    rows.push({
      type: "source-masquee",
      volume: `${item.blocked || 0} blocage(s)`,
      signal: `${item.ip_fingerprint || "ip masquee"} - ${item.user_agent_family || "ua"}`,
      last: reportDate(item.last_seen),
      action: `${item.sessions || 0} session(s), ${item.paths || 0} page(s). Surveiller sans exposer l'IP brute.`
    });
  }
  for (const item of Array.isArray(result.duplicates) ? result.duplicates : []) {
    rows.push({
      type: "doublon-filtre",
      volume: `${item.duplicates || 0} doublon(s)`,
      signal: `${item.path || "/"} - ${item.reason || "doublon-contact"}`,
      last: reportDate(item.last_seen),
      action: `${item.existing_leads || 0} lead(s) existant(s) retrouve(s). Relancer le dossier initial sans recreer un lead.`
    });
  }
  for (const item of Array.isArray(result.validation_errors) ? result.validation_errors : []) {
    rows.push({
      type: "friction-validation",
      volume: `${item.errors || 0} erreur(s)`,
      signal: `${item.path || "/"} - ${item.missing || "validation"}`,
      last: reportDate(item.last_seen),
      action: "Verifier que les messages d'erreur n'augmentent pas les abandons de vrais prospects."
    });
  }
  return rows;
}

function renderSpamTable(rows = []) {
  if (!spamBody) return;
  spamBody.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucun signal anti-spam charge.");
    td.colSpan = 5;
    tr.append(td);
    spamBody.append(tr);
    return;
  }

  for (const row of rows.slice(0, 60)) {
    const tr = document.createElement("tr");
    tr.append(
      cell(row.type),
      cell(row.volume),
      cell(row.signal),
      cell(row.last),
      cell(row.action)
    );
    spamBody.append(tr);
  }
}

async function loadSpam() {
  const token = tokenInput?.value.trim() || sessionStorage.getItem("immeubleassur_admin_token") || "";
  if (tokenInput && token) sessionStorage.setItem("immeubleassur_admin_token", token);
  if (!token) {
    if (spamSummary) spamSummary.replaceChildren(metricCard("Token requis", "Admin", "charger le bouclier anti-spam"));
    return;
  }
  if (spamSummary) spamSummary.replaceChildren(metricCard("Chargement", "Anti-spam", "lecture SQLite"));

  const response = await fetch("/api/admin/spam", { headers: { Authorization: `Bearer ${token}` } });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.error || "Chargement anti-spam impossible");

  const summary = result.summary || {};
  const repeatSources = Array.isArray(result.repeat_sources) ? result.repeat_sources : [];
  const topReasons = Array.isArray(result.top_reasons) ? result.top_reasons : [];
  const topPaths = Array.isArray(result.top_paths) ? result.top_paths : [];
  const duplicates = Array.isArray(result.duplicates) ? result.duplicates : [];
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];

  if (spamSummary) {
    spamSummary.replaceChildren(
      metricCard("Blocages 24h", String(summary.spam_blocks_24h || 0), "leads + newsletter"),
      metricCard("Blocages 7j", String(summary.spam_blocks_7d || 0), "pression recente"),
      metricCard("Blocages 30j", String(summary.spam_blocks_30d || 0), `${summary.block_rate || 0}% des tentatives`),
      metricCard("Leads filtres", String(summary.lead_spam_blocks_30d || 0), "robots devis"),
      metricCard("Newsletter filtres", String(summary.newsletter_spam_blocks_30d || 0), "robots inscription"),
      metricCard("Doublons 24h", String(summary.duplicate_leads_24h || 0), "demandes deja connues"),
      metricCard("Doublons filtres", String(summary.duplicate_leads_30d || 0), `${summary.duplicate_filter_rate || 0}% des leads traites`),
      metricCard("Tentatives", String(summary.submit_attempts_30d || 0), `${summary.leads_30d || 0} lead(s) crees`),
      metricCard("Erreurs formulaire", String(summary.validation_errors_30d || 0), "friction a surveiller"),
      metricCard("Sources masquees", String(repeatSources.length), "IP non exposees"),
      metricCard("Raisons", String(topReasons.length), topReasons[0]?.reason || "aucune dominante"),
      metricCard("Pages ciblees", String(topPaths.length), topPaths[0]?.path || "aucune"),
      metricCard("Pages doublons", String(duplicates.length), duplicates[0]?.path || "aucune"),
      metricCard("Actions", String((result.actions || []).length), warnings.length ? `${warnings.length} alerte(s)` : "priorisees")
    );
  }
  renderSpamTable(spamRows(result));
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

  const [publicReport, antifraudReport, turnstileReport] = await Promise.all([fetchPublicSeoReport(), fetchOptionalAsset("/assets/local-antifraud-latest.json"), fetchOptionalAsset("/assets/turnstile-hybrid-latest.json")]);
  const googleHealth = publicReport.google_api_health || {};
  const funnel = apiResult?.conversion_funnel || {};
  const leadStats = apiResult?.lead_stats || {};
  const expansion = publicReport.opportunity_expansion || {};
  const leadPriorities = apiResult?.lead_priorities || [];
  const ctaExperiments = apiResult?.cta_experiments || [];
  const contentBridgePaths = apiResult?.content_bridge_paths || [];
  const topContentBridge = contentBridgePaths[0];
  const contentBridgeLeads = contentBridgePaths.reduce((sum, item) => sum + Number(item.leads_created || 0), 0);
  if (seoSummary) {
    seoSummary.replaceChildren(
      metricCard("Pages controlees", String(publicReport.pages_checked || 0)),
      metricCard("Score moyen", String(publicReport.average_score || 0)),
      metricCard("Opportunites", String(publicReport.opportunities_count || 0)),
      metricCard("Google feedback", String(publicReport.google_feedback_loop?.actions?.length || 0), publicReport.google_feedback_loop?.status || "monitoring"),
      metricCard("Search Console", `${googleHealth.search_console_rows || 0}`, `${googleHealth.query_clusters || 0} cluster(s)`),
      metricCard("URL Inspection", `${googleHealth.url_inspection_checked || 0}`, `${googleHealth.url_inspection_needs_action || 0} a revoir`),
      metricCard("Sitemap Google", googleHealth.sitemap_submitted ? "OK" : "-", googleHealth.sitemap_status ? `statut ${googleHealth.sitemap_status}` : "en attente"),
      metricCard("PageSpeed API", `${googleHealth.pagespeed_checked || 0}`, `${googleHealth.pagespeed_slow_pages || 0} lente(s)`),
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
      metricCard("Accelerateur accueil", String(funnel.homepage_devis_continues || 0), `${funnel.homepage_devis_start_rate || 0}% start`),
      metricCard("Relance routeur", String(funnel.quote_fast_nudge_continues || 0), `${funnel.quote_fast_nudge_rate || 0}% suite`),
      metricCard("Formulaire -> lead", `${funnel.form_to_lead_rate || 0}%`, `${funnel.form_starts || 0} starts`),
      metricCard("Leads traites", `${funnel.attempt_to_handled_lead_rate || 0}%`, `${funnel.duplicate_filtered || 0} doublon(s)`),
      metricCard("Abandons", `${funnel.abandon_rate || 0}%`, `${funnel.abandoned_forms || 0} signaux`),
      metricCard("Rattrapage", String(funnel.form_rescue_shown || 0), `${funnel.form_rescue_phone_rate || 0}% appel`),
      metricCard("Rappel express", String(funnel.form_rescue_express_clicks || 0), `${funnel.form_rescue_express_rate || 0}% suite`),
      metricCard("Relance accueil", String(funnel.traffic_rescue_shown || 0), `${funnel.traffic_rescue_click_rate || 0}% clic`),
      metricCard("Urgence accueil", String(funnel.traffic_rescue_urgency_selects || 0), `${funnel.traffic_rescue_urgency_select_rate || 0}% selection`),
      metricCard("Pont contenu", String(funnel.content_bridge_shown || 0), `${funnel.content_bridge_click_rate || 0}% clic`),
      metricCard("Leads pont", String(funnel.content_bridge_leads || contentBridgeLeads || 0), `${funnel.content_bridge_click_to_lead_rate || 0}% clic -> lead`),
      metricCard("Top pont", topContentBridge?.path || "-", topContentBridge ? `${topContentBridge.leads_created || 0} lead(s), ${topContentBridge.clicks || 0}/${topContentBridge.shown || 0} clic(s)` : "contenu"),
      metricCard("Erreurs formulaire", String(funnel.validation_errors || 0), "champs bloquants"),
      metricCard("Spam bloques", String(funnel.spam_blocked || 0), "robots filtres"),
      metricCard("Turnstile", turnstileReport.configured ? "Actif" : "Fallback", turnstileReport.configured ? `${turnstileReport.forms_instrumented || 0}/${turnstileReport.forms_detected || 0} formulaire(s)` : "anti-fraude local"),
      metricCard("Anti-fraude local", antifraudReport.status === "passed" ? "Actif" : "A verifier", `${antifraudReport.forms_instrumented || 0}/${antifraudReport.forms_detected || 0} formulaire(s)`)
    );
  }

  const fallbackRows = [
    ...(publicReport.google_feedback_loop?.actions || []).map((item) => ({ score: item.priority === "high" ? 90 : item.priority === "fix" ? 88 : item.priority === "setup" ? 80 : 55, opportunity_type: `google-${item.source || "feedback"}`, url: item.url || item.cluster || "google", query: item.priority || "monitoring", recommendation: item.action || "Mesurer et optimiser." })),
    ...(antifraudReport.status === "passed" ? [] : [{ score: 82, opportunity_type: "anti-spam-local", url: "formulaires", query: "configuration", recommendation: "Verifier le honeypot, les signaux JS et le jeton de session local sur tous les formulaires." }]),
    ...(publicReport.conversion_intelligence?.actions || []).map((item) => ({ score: item.score || 0, opportunity_type: "conversion-intelligence", url: item.url || item.cluster || "money-page", query: item.priority || item.cluster || "lead", recommendation: item.action || "Renforcer le passage vers devis qualifie." })),
    ...(apiResult?.lead_actions || []),
    ...(ctaExperiments || []).slice(0, 6).map((item) => ({ score: item.leads_created || item.form_starts || item.cta_clicks || 0, opportunity_type: "test-cta", url: item.variant || "cta", query: `${item.views || 0} vues / ${item.cta_clicks || 0} clics / ${item.form_starts || 0} starts / ${Math.round(item.lead_value_max_total || 0)} EUR potentiel CTA`, recommendation: "Comparer les variantes avec les leads crees et leur valeur estimee avant de figer le message." })),
    ...(apiResult?.conversion_gaps || []).slice(0, 8).map((item) => ({ score: Number(item.form_starts || 0) - Number(item.leads_created || 0) - Number(item.duplicate_filtered || 0), opportunity_type: "conversion-gap", url: item.path, query: `${item.form_starts || 0} starts / ${item.leads_created || 0} leads / ${item.duplicate_filtered || 0} doublons`, recommendation: "Verifier intention, reassurance et friction formulaire sur cette page." })),
    ...(Number(funnel.form_rescue_shown || 0) ? [{ score: Number(funnel.form_rescue_shown || 0), opportunity_type: "rattrapage-formulaire", url: "formulaire", query: `${funnel.form_rescue_phone_clicks || 0} appel(s), ${funnel.form_rescue_express_clicks || 0} express / ${funnel.form_rescue_shown || 0} affichage(s)`, recommendation: "Comparer les pages ou le panneau de rattrapage transforme l'hesitation en appel ou rappel express." }] : []),
    ...(Number(funnel.traffic_rescue_shown || 0) ? [{ score: Number(funnel.traffic_rescue_clicks || 0), opportunity_type: "relance-accueil", url: "/", query: `${funnel.traffic_rescue_clicks || 0}/${funnel.traffic_rescue_shown || 0} clic(s), ${funnel.traffic_rescue_urgency_selects || 0} urgence(s)`, recommendation: "Comparer la relance accueil avec les starts formulaire et ajuster le texte si les visiteurs ferment sans cliquer." }] : []),
    ...(Number(funnel.content_bridge_shown || 0) ? [{ score: Number(funnel.content_bridge_clicks || 0), opportunity_type: "pont-contenu", url: "contenu-seo", query: `${funnel.content_bridge_clicks || 0}/${funnel.content_bridge_shown || 0} clic(s)`, recommendation: "Comparer articles, FAQ et villes qui transforment le mieux la lecture en demande de devis." }] : []),
    ...contentBridgePaths.slice(0, 8).map((item) => ({ score: (Number(item.leads_created || 0) * 10) + Number(item.clicks || item.shown || 0), opportunity_type: "page-pont-contenu", url: item.path, query: `${item.leads_created || 0} lead(s), ${item.clicks || 0}/${item.shown || 0} clic(s), ${item.content_kind || "contenu"}`, recommendation: item.leads_created > 0 ? "Renforcer le maillage interne, les contenus satellites et le CTA de cette page car elle produit des leads confirmes." : item.clicks > 0 ? "Verifier le formulaire cible: cette page declenche des clics mais pas encore de lead confirme." : "Tester le texte du pont contenu sur cette page avant de l'etendre." })),
    ...(apiResult?.diagnostic_paths || []).slice(0, 8).map((item) => ({ score: item.completions, opportunity_type: "diagnostic", url: item.path, query: `${item.completions || 0} completions ${item.target || ""}`.trim(), recommendation: "Renforcer le CTA et le contenu du parcours diagnostic qui capte cette intention." })),
    ...(apiResult?.readiness_paths || []).slice(0, 8).map((item) => ({ score: item.completions, opportunity_type: "dossier-pret", url: item.path, query: `${item.completions || 0} dossiers, score ${Math.round(item.avg_score || 0)}%`, recommendation: "Renforcer les elements de preuve et le CTA formulaire sur les pages qui preparent le mieux le dossier." })),
    ...(apiResult?.value_hint_paths || []).slice(0, 8).map((item) => ({ score: item.completions, opportunity_type: "estimation-prime", url: item.path, query: `${item.completions || 0} affichages, potentiel ${Math.round(item.avg_value_max || 0)} EUR`, recommendation: "Renforcer le bloc prix, les preuves et le CTA devis sur les pages qui declenchent les meilleures estimations." })),
    ...(apiResult?.validation_errors || []).slice(0, 8).map((item) => ({ score: item.errors, opportunity_type: "validation-friction", url: item.path, query: `${item.errors || 0} blocages: ${item.missing || "validation"}`, recommendation: "Rendre les champs concernes plus explicites et reduire la friction avant envoi du formulaire." })),
    ...(apiResult?.spam_blocks || []).slice(0, 8).map((item) => ({ score: item.blocked, opportunity_type: "spam-bloque", url: item.path, query: `${item.blocked || 0} blocages: ${item.reason || "anti-spam"}`, recommendation: "Verifier les signaux robots et surveiller les attaques de formulaire sans les transformer en leads." })),
    ...(apiResult?.duplicate_leads || []).slice(0, 8).map((item) => ({ score: item.duplicates, opportunity_type: "doublon-filtre", url: item.path, query: `${item.duplicates || 0} doublons: ${item.reason || "doublon-contact"}`, recommendation: "Ne pas les compter en nouveaux leads; utiliser le signal pour prioriser la relance du dossier existant." })),
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
    loadIntegrations().catch(() => {});
    loadNewsletter().catch(() => {});
    loadContent().catch(() => {});
    loadSpam().catch(() => {});
    loadSales().catch(() => {});
    loadAttribution().catch(() => {});
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

integrationsButton?.addEventListener("click", () => {
  loadIntegrations().catch((error) => {
    if (integrationsSummary) integrationsSummary.replaceChildren(metricCard("Erreur", "API", error.message || "chargement impossible"));
  });
});
newsletterButton?.addEventListener("click", () => {
  loadNewsletter().catch((error) => {
    if (newsletterSummary) newsletterSummary.replaceChildren(metricCard("Erreur", "Newsletter", error.message || "chargement impossible"));
  });
});

contentButton?.addEventListener("click", () => {
  loadContent().catch((error) => {
    if (contentSummary) contentSummary.replaceChildren(metricCard("Erreur", "Contenu", error.message || "chargement impossible"));
  });
});
spamButton?.addEventListener("click", () => {
  loadSpam().catch((error) => {
    if (spamSummary) spamSummary.replaceChildren(metricCard("Erreur", "Anti-spam", error.message || "chargement impossible"));
  });
});
salesButton?.addEventListener("click", () => {
  loadSales().catch((error) => {
    if (salesSummary) salesSummary.replaceChildren(metricCard("Erreur", "Relances", error.message || "chargement impossible"));
  });
});
attributionButton?.addEventListener("click", () => {
  loadAttribution().catch((error) => {
    if (attributionSummary) attributionSummary.replaceChildren(metricCard("Erreur", "Attribution", error.message || "chargement impossible"));
  });
});
newsletterSendButton?.addEventListener("click", () => {
  sendNewsletter();
});
