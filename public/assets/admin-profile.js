const profileLoginForm = document.querySelector("#admin-profile-login-form");
const profileCreateForm = document.querySelector("#admin-profile-create-form");
const profileStatus = document.querySelector("#admin-profile-status");
const profileLogout = document.querySelector("#admin-profile-logout");
const passwordForm = document.querySelector("#admin-profile-password-form");
const masterTokenInput = document.querySelector("#admin-token");
const adminForm = document.querySelector("#admin-form");
const auditButton = document.querySelector("#load-admin-auth-events");
const auditBody = document.querySelector("#admin-auth-events-body");
const PROFILE_SESSION_KEY = "immeubleassur_admin_token";

function status(message, type = "") {
  if (!profileStatus) return;
  profileStatus.textContent = message;
  profileStatus.className = ("form-status " + type).trim();
}

function token() {
  return masterTokenInput?.value.trim() || sessionStorage.getItem(PROFILE_SESSION_KEY) || "";
}

async function responseJson(response) {
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok || !body.success) throw new Error(body.error || "Operation impossible");
  return body;
}

function renderAuditEvents(events = []) {
  if (!auditBody) return;
  auditBody.replaceChildren();
  if (!events.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "Aucun acces enregistre.";
    row.append(cell);
    auditBody.append(row);
    return;
  }
  for (const event of events) {
    const row = document.createElement("tr");
    for (const value of [event.created_at, event.email, event.action, event.success ? "Succes" : "Echec", event.ip_address, event.user_agent]) {
      const cell = document.createElement("td");
      cell.textContent = String(value || "-");
      row.append(cell);
    }
    auditBody.append(row);
  }
}

async function loadAuditEvents() {
  const current = token();
  if (!current) {
    status("Authentifiez-vous pour consulter l audit.", "error");
    return;
  }
  status("Chargement de l audit...");
  const body = await responseJson(await fetch("/api/admin/auth?events=1", {
    headers: { Authorization: "Bearer " + current }
  }));
  renderAuditEvents(body.events || []);
  status("Audit charge.", "ok");
}
profileLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(profileLoginForm);
  status("Connexion...");
  try {
    const body = await responseJson(await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: form.get("email"), password: form.get("password") })
    }));
    sessionStorage.setItem(PROFILE_SESSION_KEY, body.session.token);
    if (masterTokenInput) masterTokenInput.value = body.session.token;
    status("Session ouverte pour " + (body.profile?.display_name || body.profile?.email || "operateur") + ".", "ok");
    profileLoginForm.reset();
    adminForm?.requestSubmit();
  } catch (error) {
    status(error.message || "Connexion refusee.", "error");
  }
});

profileCreateForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const authorization = token();
  if (!authorization) {
    status("Chargez d abord le jeton maitre pour creer un profil.", "error");
    return;
  }
  const form = new FormData(profileCreateForm);
  status("Creation du profil...");
  try {
    const body = await responseJson(await fetch("/api/admin/auth", {
      method: "POST",
      headers: { Authorization: "Bearer " + authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_profile",
        email: form.get("email"),
        display_name: form.get("display_name"),
        role: form.get("role"),
        password: form.get("password")
      })
    }));
    profileCreateForm.reset();
    status("Profil cree pour " + body.profile.email + ".", "ok");
  } catch (error) {
    status(error.message || "Creation refusee.", "error");
  }
});

profileLogout?.addEventListener("click", async () => {
  const current = token();
  if (current) {
    await fetch("/api/admin/auth", {
      method: "POST",
      headers: { Authorization: "Bearer " + current, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" })
    }).catch(() => {});
  }
  sessionStorage.removeItem(PROFILE_SESSION_KEY);
  if (masterTokenInput) masterTokenInput.value = "";
  status("Session fermee.", "ok");
  document.querySelector("#leads-body")?.replaceChildren();
});
auditButton?.addEventListener("click", () => loadAuditEvents().catch((error) => {
  status(error.message || "Audit indisponible.", "error");
}));
passwordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const current = token();
  if (!current) {
    status("Authentifiez-vous pour changer le mot de passe.", "error");
    return;
  }
  const form = new FormData(passwordForm);
  status("Mise a jour du mot de passe...");
  try {
    await responseJson(await fetch("/api/admin/auth", {
      method: "POST",
      headers: { Authorization: "Bearer " + current, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "change_password", current_password: form.get("current_password"), new_password: form.get("new_password") })
    }));
    sessionStorage.removeItem(PROFILE_SESSION_KEY);
    if (masterTokenInput) masterTokenInput.value = "";
    passwordForm.reset();
    status("Mot de passe modifie. Reconnectez-vous.", "ok");
  } catch (error) {
    status(error.message || "Modification refusee.", "error");
  }
});
