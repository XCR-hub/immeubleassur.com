const form = document.querySelector("#admin-form");
const tokenInput = document.querySelector("#admin-token");
const statusBox = document.querySelector(".form-status");
const body = document.querySelector("#leads-body");
const seoButton = document.querySelector("#load-seo");
const seoSummary = document.querySelector("#seo-summary");
const seoBody = document.querySelector("#seo-opportunities-body");

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

function render(rows) {
  if (!body) return;
  body.replaceChildren();
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = cell("Aucun lead trouve.");
    td.colSpan = 10;
    tr.append(td);
    body.append(tr);
    return;
  }

  for (const lead of rows) {
    const tr = document.createElement("tr");
    tr.append(
      cell(new Date(lead.created_at).toLocaleString("fr-FR")),
      cell(lead.reference),
      cell(`${lead.name}\n${lead.phone}\n${lead.email}`),
      cell(lead.profile),
      cell(`${lead.property_type}${lead.units_count ? `\n${lead.units_count} lots` : ""}`),
      cell(lead.city),
      cell(lead.need),
      cell(lead.status),
      cell(String(lead.lead_score)),
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
  if (seoSummary) {
    seoSummary.replaceChildren(
      metricCard("Pages controlees", String(publicReport.pages_checked || 0)),
      metricCard("Score moyen", String(publicReport.average_score || 0)),
      metricCard("Opportunites", String(publicReport.opportunities_count || 0)),
      metricCard("Leads 30j", String(apiResult?.lead_stats?.leads_30d || 0), apiResult?.latest_run?.status || "rapport build")
    );
  }

  const rows = apiResult?.opportunities?.length ? apiResult.opportunities : (publicReport.top_opportunities || []);
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
    render(result.leads || []);
    setStatus(`${result.leads.length} lead(s) charge(s).`, "ok");
    loadSeo().catch(() => {});
  } catch (error) {
    setStatus(error.message || "Erreur de chargement", "error");
  }
});

seoButton?.addEventListener("click", () => {
  loadSeo().catch((error) => {
    if (seoSummary) seoSummary.replaceChildren(metricCard("Erreur", "SEO", error.message || "chargement impossible"));
  });
});