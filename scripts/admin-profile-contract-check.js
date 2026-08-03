import { readFileSync } from "node:fs";

const expectations = [
  ["schema.sql", ["admin_profiles", "admin_auth_events", "password_hash", "failed_login_count"]],
  ["functions/_shared/admin-auth.js", ["admin-profile-session-v1", "ADMIN_SESSION_TTL_MS", "createAdminSession", "revokeAdminSession", "adminRequestAllowed"]],
  ["functions/api/admin/auth.js", ["PBKDF2", "create_profile", "admin_auth_events", "login_failed", "admin-profile-login-v1", "locked_until", "Identifiants invalides"]],
  ["scripts/local-production-server.js", ["/api/admin/auth"]],
  ["public/admin.html", ["admin-profile-login-form", "admin-profile-create-form", "admin-profile-logout", "admin-profile.js"]],
  ["public/assets/admin-profile.js", ["admin-profile-login", "create_profile", "sessionStorage", "admin-profile-status"]],
  ["scripts/admin-profile-workflow-smoke.js", ["PBKDF2 login", "CRM session", "readonly profile should not mutate CRM leads", "authentication audit must not store passwords", "logged out operator session"]],
  ["package.json", ["admin:profiles:smoke", "functions/api/admin/auth.js"]]
];

const missing = [];
for (const [file, snippets] of expectations) {
  const source = readFileSync(file, "utf8");
  for (const snippet of snippets) if (!source.includes(snippet)) missing.push(file + ":" + snippet);
}
if (missing.length) {
  console.error("Admin profile contract failed: " + missing.join(", "));
  process.exit(1);
}
console.log("Admin profile contract passed for " + expectations.reduce((sum, item) => sum + item[1].length, 0) + " required markers.");