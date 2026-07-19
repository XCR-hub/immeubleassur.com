const form = document.querySelector("#admin-form");
const tokenInput = document.querySelector("#admin-token");
const statusBox = document.querySelector(".form-status");
const body = document.querySelector("#leads-body");

if (tokenInput) tokenInput.value = sessionStorage.getItem("immeubleassur_admin_token") || "";

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = `form-status ${type}`.trim();
}

function cell(text) {
  const td = document.createElement("td");
  td.textContent = text || "";
  return td;
}

function render(rows) {
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
  } catch (error) {
    setStatus(error.message || "Erreur de chargement", "error");
  }
});
