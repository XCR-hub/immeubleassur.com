import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openLocalSqlite } from "./local-sqlite-db.js";
import { onRequestPost as authPost, onRequestGet as authGet } from "../functions/api/admin/auth.js";
import { onRequestGet as leadsGet, onRequestPatch as leadsPatch } from "../functions/api/admin/leads.js";

const root = mkdtempSync(join(tmpdir(), "immeubleassur-admin-profile-"));
const DB = openLocalSqlite({ dbPath: join(root, "profile.sqlite"), schemaPath: "schema.sql" });
const env = { DB, ADMIN_API_TOKEN: "admin-profile-master-token" };
const origin = "https://immeubleassur.test";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

function request(path, options = {}) {
  return new Request(origin + path, options);
}

try {
  const create = await read(await authPost({
    request: request("/api/admin/auth", {
      method: "POST",
      headers: { Authorization: "Bearer admin-profile-master-token", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_profile", email: "slebon@xcr.fr", display_name: "Slebon", role: "commercial", password: "Longue-Phrase-2026!" })
    }),
    env
  }));
  assert(create.status === 201 && create.body.profile?.email === "slebon@xcr.fr", "master should create operator profile");

  const readonlyCreate = await read(await authPost({ request: request("/api/admin/auth", { method: "POST", headers: { Authorization: "Bearer admin-profile-master-token", "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_profile", email: "lecture@example.test", display_name: "Lecture", role: "readonly", password: "Lecture-Phrase-2026!" }) }), env }));
  assert(readonlyCreate.status === 201 && readonlyCreate.body.profile?.role === "readonly", "master should create readonly profile");

  const wrong = await read(await authPost({
    request: request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: "slebon@xcr.fr", password: "incorrect-password" })
    }),
    env
  }));
  assert(wrong.status === 401, "wrong operator password should be rejected");

  const login = await read(await authPost({
    request: request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: "slebon@xcr.fr", password: "Longue-Phrase-2026!" })
    }),
    env
  }));
  assert(login.status === 200 && login.body.session?.token && login.body.profile?.role === "commercial", "operator should receive a temporary session");
  const authorization = { Authorization: "Bearer " + login.body.session.token };

  const me = await read(await authGet({ request: request("/api/admin/auth", { headers: authorization }), env }));
  assert(me.status === 200 && me.body.mode === "profile", "session should expose profile mode");

  const leads = await read(await leadsGet({ request: request("/api/admin/leads", { headers: authorization }), env }));
  assert(leads.status === 200 && leads.body.success === true, "operator session should access CRM leads");

  const readonlyLogin = await read(await authPost({
    request: request("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: "lecture@example.test", password: "Lecture-Phrase-2026!" })
    }),
    env
  }));
  assert(readonlyLogin.status === 200 && readonlyLogin.body.profile?.role === "readonly", "readonly profile should login");
  const readonlyAuthorization = { Authorization: "Bearer " + readonlyLogin.body.session.token };
  const readonlyPatch = await read(await leadsPatch({
    request: request("/api/admin/leads", { method: "PATCH", headers: { ...readonlyAuthorization, "Content-Type": "application/json" }, body: JSON.stringify({ reference: "DOS-READONLY", status: "contacted" }) }),
    env
  }));
  assert(readonlyPatch.status === 401, "readonly profile should not mutate CRM leads");
  const logout = await read(await authPost({ request: request("/api/admin/auth", { method: "POST", headers: authorization, body: JSON.stringify({ action: "logout" }) }), env }));
  assert(logout.status === 200 && logout.body.success, "operator logout should succeed");

  const revoked = await read(await authGet({ request: request("/api/admin/auth", { headers: authorization }), env }));
  assert(revoked.status === 401, "logged out operator session should be rejected");

  console.log("Admin profile workflow smoke passed: protected creation -> PBKDF2 login -> CRM session -> logout.");
} finally {
  DB.close();
  rmSync(root, { recursive: true, force: true });
}