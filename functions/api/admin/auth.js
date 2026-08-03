import {
  adminSessionProfile,
  adminTokenMatches,
  createAdminSession,
  masterAdminTokenMatches,
  revokeAdminSession
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
  return json({ success: true, profile: publicProfile(row), marker: "admin-profile-created-v1" }, 201);
}

async function login(request, env, body) {
  const email = normalizedEmail(body.email);
  const password = String(body.password || "");
  if (!validEmail(email) || !password) return json({ success: false, error: "Identifiants invalides" }, 401);
  const row = await env.DB.prepare("SELECT * FROM admin_profiles WHERE lower(email) = ? LIMIT 1").bind(email).first();
  const now = new Date();
  const genericError = () => json({ success: false, error: "Identifiants invalides" }, 401);
  if (!row || Number(row.active) !== 1) return genericError();
  if (row.locked_until && new Date(row.locked_until).getTime() > now.getTime()) return genericError();
  const matches = await passwordMatches(password, row.password_salt, row.password_hash);
  if (!matches) {
    const failed = Number(row.failed_login_count || 0) + 1;
    const lockedUntil = failed >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : "";
    await env.DB.prepare("UPDATE admin_profiles SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?").bind(failed, lockedUntil, now.toISOString(), row.id).run();
    return genericError();
  }
  await env.DB.prepare("UPDATE admin_profiles SET failed_login_count = 0, locked_until = '', last_login_at = ?, updated_at = ? WHERE id = ?").bind(now.toISOString(), now.toISOString(), row.id).run();
  const session = createAdminSession(row);
  return json({ success: true, profile: publicProfile({ ...row, last_login_at: now.toISOString() }), session, marker: "admin-profile-login-v1" });
}

export async function onRequestGet({ request, env }) {
  if (!adminTokenMatches(request, env)) return json({ success: false, error: "Acces refuse" }, 401);
  const profile = adminSessionProfile(request);
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
  if (action === "logout") {
    revokeAdminSession(request);
    return json({ success: true, marker: "admin-profile-logout-v1" });
  }
  if (action === "login") return login(request, env, body);
  return json({ success: false, error: "Action non supportee" }, 400);
}