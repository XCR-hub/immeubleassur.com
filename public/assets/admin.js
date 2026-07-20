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

function priorityCell(priority) {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = `lead-priority ${String(priority || "standard").replace(/[^a-z0-9_-]/gi, "")}`;
  span.textContent = priorityLabel(priority);
  td.append(span);
  return td;
}

function qualificationFor(lead) {
  const score = Number(lead.lead_score || 0);
  return lead.qualification || {
    score,
    priority: score >= 85 ? "hot" : score >= 70 ? "warm" : score >= 45 ? "standard" : "low",
    reasons: [],
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
    lead.message,
    q.priority,
    q.reasons?.join(" "),
    q.next_action
  ].join(" ").toLowerCase();
}

function filteredLeads() {
  const query = (leadSearch?.value || "").trim().toLowerCase();
  const priority = priorityFilter?.value || "";
  return allLeads.filter((lead) => {
    const q = qualificationFor(lead);
    if (priority && q.priority !== priority) return false;
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
    td.colSpan = 12;
    tr.append(td);
    body.append(tr);
    return;
  }

  for (const lead of rows) {
    const q = qualificationFor(lead);
    const tr = document.createElement("tr");
    tr.dataset.priority = q.priority || "standard";
    tr.append(
      cell(new Date(lead.created_at).toLocaleString("fr-FR")),
      cell(lead.reference),
      cell(`${lead.name}\n${lead.phone}\n${lead.email}`),
      priorityCell(q.priority),
      cell(lead.profile),
      cell(`${lead.property_type}${lead.units_count ? `\n${lead.units_count} lots` : ""}`),
      cell(lead.city),
      cell(lead.need),
      cell(lead.status),
      cell(`${q.score ?? lead.lead_score ?? ""}${q.reasons?.length ? `\n${q.reasons.slice(0, 4).join("\n")}` : ""}`),
      cell(q.next_action || ""),
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

function exportVisibleLeads() {
  const rows = filteredLeads();
  const header = ["date", "reference", "priority", "score", "name", "phone", "email", "profile", "property_type", "city", "need", "status", "next_action", "reasons", "message"];
  const lines = [header.map(csvEscape).join(",")];
  for (const lead of rows) {
    const q = qualificationFor(lead);
    lines.push([
      lead.created_at,
      lead.reference,
      q.priority,
      q.score,
      lead.name,
      lead.phone,
      lead.email,
      lead.profile,
      lead.property_type,
      lead.city,
      lead.need,
      lead.status,
      q.next_action,
      q.reasons?.join(" | "),
      lead.message
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
  if (seoSummary) {
    seoSummary.replaceChildren(
      metricCard("Pages controlees", String(publicReport.pages_checked || 0)),
      metricCard("Score moyen", String(publicReport.average_score || 0)),
      metricCard("Opportunites", String(publicReport.opportunities_count || 0)),
      metricCard("Actions leads", String(apiResult?.lead_actions?.length || 0), `${priorityCount(leadPriorities, "hot")} chaud(s)`),
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
    ...(apiResult?.lead_actions || []),
    ...(apiResult?.conversion_gaps || []).slice(0, 8).map((item) => ({ score: Number(item.form_starts || 0) - Number(item.leads_created || 0), opportunity_type: "conversion-gap", url: item.path, query: `${item.form_starts || 0} starts / ${item.leads_created || 0} leads`, recommendation: "Verifier intention, reassurance et friction formulaire sur cette page." })),
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
    refreshLeadTable();
    loadSeo().catch(() => {});
  } catch (error) {
    setStatus(error.message || "Erreur de chargement", "error");
  }
});

leadSearch?.addEventListener("input", refreshLeadTable);
priorityFilter?.addEventListener("change", refreshLeadTable);
exportButton?.addEventListener("click", exportVisibleLeads);

seoButton?.addEventListener("click", () => {
  loadSeo().catch((error) => {
    if (seoSummary) seoSummary.replaceChildren(metricCard("Erreur", "SEO", error.message || "chargement impossible"));
  });
});