const profileLoginForm = document.querySelector("#admin-profile-login-form");
const profileCreateForm = document.querySelector("#admin-profile-create-form");
const profileStatus = document.querySelector("#admin-profile-status");
const profileLogout = document.querySelector("#admin-profile-logout");
const masterTokenInput = document.querySelector("#admin-token");
const adminForm = document.querySelector("#admin-form");
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