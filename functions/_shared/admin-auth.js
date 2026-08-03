const ADMIN_AUTH_MARKER = "admin-auth-constant-time-v1";
const ADMIN_AUTH_RATE_LIMIT_MARKER = "admin-auth-rate-limit-v1";
const ADMIN_SESSION_MARKER = "admin-profile-session-v1";
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const adminSessions = new Map();
const ADMIN_AUTH_FAILURE_LIMIT = 40;
const ADMIN_AUTH_WINDOW_MS = 5 * 60 * 1000;
const failuresByIp = new Map();

function requestIp(request) {
  const forwarded = request?.headers?.get("x-forwarded-for") || request?.headers?.get("cf-connecting-ip") || "unknown";
  return String(forwarded).split(",")[0].trim().slice(0, 120) || "unknown";
}

function failureState(ip, now) {
  const previous = failuresByIp.get(ip);
  if (!previous || now - previous.startedAt >= ADMIN_AUTH_WINDOW_MS) {
    const fresh = { startedAt: now, count: 0 };
    failuresByIp.set(ip, fresh);
    return fresh;
  }
  return previous;
}

function pruneFailures(now) {
  for (const [ip, state] of failuresByIp) {
    if (now - state.startedAt >= ADMIN_AUTH_WINDOW_MS) failuresByIp.delete(ip);
  }
}

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    const leftCode = index < a.length ? a.charCodeAt(index) : 0;
    const rightCode = index < b.length ? b.charCodeAt(index) : 0;
    difference |= leftCode ^ rightCode;
  }
  return difference === 0;
}

function bearerToken(request) {
  const header = request?.headers?.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function pruneSessions(now = Date.now()) {
  for (const [token, session] of adminSessions) {
    if (session.expires_at <= now) adminSessions.delete(token);
  }
}

function masterTokenMatches(request, env) {
  const expected = env?.ADMIN_API_TOKEN;
  if (!expected) return false;
  const now = Date.now();
  pruneFailures(now);
  const ip = requestIp(request);
  const state = failureState(ip, now);
  const provided = request?.headers?.get("Authorization") || "";
  if (state.count >= ADMIN_AUTH_FAILURE_LIMIT) return false;
  const matches = constantTimeEqual(provided, "Bearer " + expected);
  if (matches) {
    failuresByIp.delete(ip);
    return true;
  }
  state.count += 1;
  return false;
}

export function masterAdminTokenMatches(request, env) {
  return masterTokenMatches(request, env);
}

export function createAdminSession(profile = {}) {
  pruneSessions();
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  adminSessions.set(token, {
    profile_id: String(profile.id || ""),
    email: String(profile.email || ""),
    display_name: String(profile.display_name || ""),
    role: String(profile.role || "commercial"),
    expires_at: expiresAt
  });
  return { token, expires_at: new Date(expiresAt).toISOString(), marker: ADMIN_SESSION_MARKER };
}

export function adminSessionProfile(request) {
  pruneSessions();
  const token = bearerToken(request);
  const session = token ? adminSessions.get(token) : null;
  if (!session) return null;
  session.expires_at = Math.min(session.expires_at, Date.now() + ADMIN_SESSION_TTL_MS);
  return { ...session };
}

export function revokeAdminSession(request) {
  const token = bearerToken(request);
  if (token) adminSessions.delete(token);
}

export function revokeAdminSessionsForProfile(profileId) {
  const id = String(profileId || "");
  for (const [token, session] of adminSessions) {
    if (session.profile_id === id) adminSessions.delete(token);
  }
}

export function adminRequestAllowed(request, env) {
  const method = String(request?.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return adminTokenMatches(request, env);
  const profile = adminSessionProfile(request);
  if (profile) return profile.role !== "readonly";
  return masterTokenMatches(request, env);
}
export function adminTokenMatches(request, env) {
  return Boolean(adminSessionProfile(request)) || masterTokenMatches(request, env);
}

export { ADMIN_AUTH_MARKER, ADMIN_AUTH_RATE_LIMIT_MARKER, ADMIN_AUTH_FAILURE_LIMIT, ADMIN_SESSION_MARKER, ADMIN_SESSION_TTL_MS };
