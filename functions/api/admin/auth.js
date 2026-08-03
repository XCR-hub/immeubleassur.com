import {
  adminSessionProfile,
  adminTokenMatches,
  createAdminSession,
  masterAdminTokenMatches,
  revokeAdminSession,
  revokeAdminSessionsForProfile
} from "../../_shared/admin-auth.js";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const PBKDF2_ITERATIONS = 120000;
const PROFILE_ROLES = new Set(["owner", "manager", "commercial", "readonly"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function normalizedEmail(value) {
  return clean(value, 180).toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(password, saltBytes) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function passwordHash(password, saltBytes = crypto.getRandomValues(new Uint8Array(16))) {
  return {
    salt: bytesToBase64(saltBytes),
    hash: bytesToBase64(await derivePassword(password, saltBytes))
  };
}

async function passwordMatches(password, salt, expectedHash) {
  try {
    const actual = await derivePassword(password, base64ToBytes(salt));
    return constantTimeEqual(actual, base64ToBytes(expectedHash));
  } catch {
    return false;
  }
}

function publicProfile(row) {
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    active: Number(row.active) === 1,
    last_login_at: row.last_login_at || "",
    marker: "admin-profile-v1"
  };
}

function requestContext(request) {
  return {
    ip_address: clean(request?.headers?.get("x-forwarded-for") || request?.headers?.get("cf-connecting-ip"), 120).split(",")[0].trim(),
    user_agent: clean(request?.headers?.get("user-agent"), 500)
  };
}

async function logAuthEvent(env, request, details = {}) {
  try {
    const context = requestContext(request);
    await env.DB.prepare(
      "INSERT INTO admin_auth_events (id, profile_id, email, action, success, ip_address, user_agent, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      clean(details.profile_id, 120),
      normalizedEmail(details.email || ""),
      clean(details.action, 80),
      details.success ? 1 : 0,
      context.ip_address,
      context.user_agent,
      JSON.stringify(details.payload || {}),
      new Date().toISOString()
    ).run();
    await env.DB.prepare("DELETE FROM admin_auth_events WHERE created_at < datetime('now', '-180 days')").run();
  } catch {
    // Authentication must remain available if audit storage is temporarily unavailable.
  }
}
async function bodyOf(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function createProfile(request, env, body) {
  if (!masterAdminTokenMatches(request, env)) return json({ success: false, error: "Acces maitre requis" }, 401);
  const email = normalizedEmail(body.email);
  const displayName = clean(body.display_name || body.name, 160);
  const roleValue = clean(body.role, 40);
  const role = PROFILE_ROLES.has(roleValue) ? roleValue : "commercial";
  const password = String(body.password || "");
  if (!validEmail(email) || !displayName || password.length < 12) {
    return json({ success: false, error: "Email, nom et mot de passe de 12 caracteres minimum requis" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM admin_profiles WHERE lower(email) = ?").bind(email).first();
  if (existing) return json({ success: false, error: "Profil deja existant" }, 409);
  const now = new Date().toISOString();
  const credentials = await passwordHash(password);
  const row = {
    id: crypto.randomUUID(),
    email,
    display_name: displayName,
    role,
    active: 1,
    password_hash: credentials.hash,
    password_salt: credentials.salt,
    failed_login_count: 0,
    locked_until: "",
    last_login_at: "",
    created_at: now,
    updated_at: now
  };
  const insertSql = "INSERT INTO admin_profiles (id, email, display_name, role, active, password_hash, password_salt, failed_login_count, locked_until, last_login_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
  await env.DB.prepare(insertSql).bind(row.id, row.email, row.display_name, row.role, row.active, row.password_hash, row.password_salt, 0, "", "", now, now).run();
  await logAuthEvent(env, request, { profile_id: row.id, email: row.email, action: "profile_created", success: true, payload: { role: row.role } });
  return json({ success: true, profile: publicProfile(row), marker: "admin-profile-created-v1" }, 201);
}

async function hashInviteToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token || "")));
  return bytesToBase64(new Uint8Array(digest));
}

function randomInviteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function createProfileInvite(request, env, body) {
  if (!masterAdminTokenMatches(request, env)) return json({ success: false, error: "Acces maitre requis" }, 401);
  const email = normalizedEmail(body.email);
  const displayName = clean(body.display_name || body.name, 160);
  const roleValue = clean(body.role, 40);
  const role = PROFILE_ROLES.has(roleValue) ? roleValue : "commercial";
  if (!validEmail(email) || !displayName) return json({ success: false, error: "Email et nom valides requis" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM admin_profiles WHERE lower(email) = ?").bind(email).first();
  if (existing) return json({ success: false, error: "Profil deja existant" }, 409);
  const token = randomInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("UPDATE admin_profile_invites SET used_at = ? WHERE email = ? AND used_at = '' AND expires_at > ?").bind(now.toISOString(), email, now.toISOString()).run();
  await env.DB.prepare("INSERT INTO admin_profile_invites (id, token_hash, email, display_name, role, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, '', ?)").bind(crypto.randomUUID(), await hashInviteToken(token), email, displayName, role, expiresAt, now.toISOString()).run();
  await logAuthEvent(env, request, { email, action: "profile_invite_created", success: true, payload: { role, expires_at: expiresAt } });
  const origin = clean(new URL(request.url).origin, 240);
  return json({ success: true, invite_url: (origin || "") + "/admin.html?invite=" + encodeURIComponent(token), expires_at: expiresAt, marker: "admin-profile-invite-created-v1" }, 201);
}

async function acceptProfileInvite(request, env, body) {
  const token = clean(body.token, 240);
  const password = String(body.password || "");
  if (!token || password.length < 12) return json({ success: false, error: "Invitation et mot de passe de 12 caracteres minimum requis" }, 400);
  const now = new Date().toISOString();
  const row = await env.DB.prepare("SELECT * FROM admin_profile_invites WHERE token_hash = ? AND used_at = '' AND expires_at > ? LIMIT 1").bind(await hashInviteToken(token), now).first();
  if (!row) return json({ success: false, error: "Invitation invalide ou expiree" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM admin_profiles WHERE lower(email) = ?").bind(row.email).first();
  if (existing) return json({ success: false, error: "Profil deja existant" }, 409);
  const credentials = await passwordHash(password);
  const profileId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO admin_profiles (id, email, display_name, role, active, password_hash, password_salt, failed_login_count, locked_until, last_login_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, 0, '', '', ?, ?)").bind(profileId, row.email, row.display_name, row.role, credentials.hash, credentials.salt, now, now).run();
  await env.DB.prepare("UPDATE admin_profile_invites SET used_at = ? WHERE id = ?").bind(now, row.id).run();
  await logAuthEvent(env, request, { profile_id: profileId, email: row.email, action: "profile_created_from_invite", success: true, payload: { role: row.role } });
  return json({ success: true, profile: publicProfile({ id: profileId, email: row.email, display_name: row.display_name, role: row.role, active: 1, last_login_at: "" }), marker: "admin-profile-invite-accepted-v1" }, 201);
}

async function changePassword(request, env, body) {
  const session = adminSessionProfile(request);
  const isMaster = masterAdminTokenMatches(request, env);
  if (!session && !isMaster) return json({ success: false, error: "Acces refuse" }, 401);
  if (session?.role === "readonly") return json({ success: false, error: "Acces refuse" }, 403);
  const newPassword = String(body.new_password || "");
  if (newPassword.length < 12) return json({ success: false, error: "Le nouveau mot de passe doit contenir au moins 12 caracteres" }, 400);
  const profileId = session?.profile_id || clean(body.profile_id, 120);
  const row = await env.DB.prepare("SELECT * FROM admin_profiles WHERE id = ? LIMIT 1").bind(profileId).first();
  if (!row || Number(row.active) !== 1) return json({ success: false, error: "Profil introuvable" }, 404);
  if (!isMaster) {
    const currentPassword = String(body.current_password || "");
    if (!currentPassword || !(await passwordMatches(currentPassword, row.password_salt, row.password_hash))) {
      await logAuthEvent(env, request, { profile_id: row.id, email: row.email, action: "password_change_failed", success: false });
      return json({ success: false, error: "Mot de passe actuel invalide" }, 401);
    }
  }
  const credentials = await passwordHash(newPassword);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE admin_profiles SET password_hash = ?, password_salt = ?, failed_login_count = 0, locked_until = '', updated_at = ? WHERE id = ?").bind(credentials.hash, credentials.salt, now, row.id).run();
  revokeAdminSessionsForProfile(row.id);
  await logAuthEvent(env, request, { profile_id: row.id, email: row.email, action: "password_changed", success: true, payload: { actor: isMaster ? "master" : "self" } });
  return json({ success: true, marker: "admin-profile-password-changed-v1" });
}
async function login(request, env, body) {
  const email = normalizedEmail(body.email);
  const password = String(body.password || "");
  const genericError = async (action, profileId = "") => {
    await logAuthEvent(env, request, { profile_id: profileId, email, action, success: false });
    return json({ success: false, error: "Identifiants invalides" }, 401);
  };
  if (!validEmail(email) || !password) return genericError("login_invalid_input");
  const row = await env.DB.prepare("SELECT * FROM admin_profiles WHERE lower(email) = ? LIMIT 1").bind(email).first();
  const now = new Date();
  if (!row || Number(row.active) !== 1) return genericError("login_unknown_profile", row?.id || "");
  if (row.locked_until && new Date(row.locked_until).getTime() > now.getTime()) return genericError("login_locked", row.id);
  const matches = await passwordMatches(password, row.password_salt, row.password_hash);
  if (!matches) {
    const failed = Number(row.failed_login_count || 0) + 1;
    const lockedUntil = failed >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : "";
    await env.DB.prepare("UPDATE admin_profiles SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?").bind(failed, lockedUntil, now.toISOString(), row.id).run();
    await logAuthEvent(env, request, { profile_id: row.id, email, action: "login_failed", success: false, payload: { failed_count: failed, locked: Boolean(lockedUntil) } });
    return json({ success: false, error: "Identifiants invalides" }, 401);
  }
  await env.DB.prepare("UPDATE admin_profiles SET failed_login_count = 0, locked_until = '', last_login_at = ?, updated_at = ? WHERE id = ?").bind(now.toISOString(), now.toISOString(), row.id).run();
  const session = createAdminSession(row);
  await logAuthEvent(env, request, { profile_id: row.id, email, action: "login_success", success: true, payload: { role: row.role } });
  return json({ success: true, profile: publicProfile({ ...row, last_login_at: now.toISOString() }), session, marker: "admin-profile-login-v1" });
}
export async function onRequestGet({ request, env }) {
  if (!adminTokenMatches(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  const profile = adminSessionProfile(request);
  const url = new URL(request.url);
  if (url.searchParams.get("events") === "1") {
    if (profile && !["owner", "manager"].includes(profile.role)) return json({ success: false, error: "Acces refuse" }, 403);
    const rows = await env.DB.prepare(
      "SELECT id, profile_id, email, action, success, ip_address, user_agent, created_at FROM admin_auth_events ORDER BY created_at DESC LIMIT 100"
    ).all();
    return json({
      success: true,
      events: (rows?.results || []).map((row) => ({
        id: row.id,
        profile_id: row.profile_id || "",
        email: row.email || "",
        action: row.action || "",
        success: Number(row.success) === 1,
        ip_address: row.ip_address || "",
        user_agent: row.user_agent || "",
        created_at: row.created_at || ""
      })),
      marker: "admin-auth-audit-v1"
    });
  }
  return json({
    success: true,
    mode: profile ? "profile" : "master",
    profile: profile ? { ...profile, marker: "admin-profile-session-v1" } : null,
    marker: "admin-auth-v1"
  });
}

export async function onRequestPost({ request, env }) {
  const body = await bodyOf(request);
  const action = clean(body.action || "login", 40);
  if (action === "create_profile") return createProfile(request, env, body);
  if (action === "create_invite") return createProfileInvite(request, env, body);
  if (action === "accept_invite") return acceptProfileInvite(request, env, body);
  if (action === "change_password") return changePassword(request, env, body);
  if (action === "logout") {
    const profile = adminSessionProfile(request);
    await logAuthEvent(env, request, { profile_id: profile?.profile_id || "", email: profile?.email || "master", action: "logout", success: true, payload: { role: profile?.role || "master" } });
    revokeAdminSession(request);
    return json({ success: true, marker: "admin-profile-logout-v1" });
  }
  if (action === "login") return login(request, env, body);
  return json({ success: false, error: "Action non supportee" }, 400);
}