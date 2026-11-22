// Match the public _redirects policy on the native Node servers too.
export function canonicalHostRedirect(request) {
  if (!["GET", "HEAD"].includes(request.method || "GET")) return "";
  const host = String(request.headers?.host || "").toLowerCase();
  if (!["www.immeubleassur.com", "www.immeubleassur.com:443", "www.immeubleassur.com:80"].includes(host)) return "";
  const target = new URL(request.url || "/", "https://immeubleassur.com");
  return "https://immeubleassur.com" + target.pathname + target.search;
}
