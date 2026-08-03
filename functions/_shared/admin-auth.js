const ADMIN_AUTH_MARKER = "admin-auth-constant-time-v1";

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
  const provided = request?.headers?.get("Authorization") || "";
  return constantTimeEqual(provided, `Bearer ${expected}`);
}

export { ADMIN_AUTH_MARKER };