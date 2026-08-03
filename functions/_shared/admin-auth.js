const ADMIN_AUTH_MARKER = "admin-auth-constant-time-v1";
const ADMIN_AUTH_RATE_LIMIT_MARKER = "admin-auth-rate-limit-v1";
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

export function adminTokenMatches(request, env) {
  const expected = env?.ADMIN_API_TOKEN;
  if (!expected) return false;
  const now = Date.now();
  pruneFailures(now);
  const ip = requestIp(request);
  const state = failureState(ip, now);
  const provided = request?.headers?.get("Authorization") || "";
  if (state.count >= ADMIN_AUTH_FAILURE_LIMIT) return false;
  const matches = constantTimeEqual(provided, `Bearer ${expected}`);
  if (matches) {
    failuresByIp.delete(ip);
    return true;
  }
  state.count += 1;
  return false;
}

export { ADMIN_AUTH_MARKER, ADMIN_AUTH_RATE_LIMIT_MARKER, ADMIN_AUTH_FAILURE_LIMIT };