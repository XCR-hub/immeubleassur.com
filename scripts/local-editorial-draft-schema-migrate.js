import { existsSync, mkdirSync, readFileSync, renameSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { env, loadDefaultEnvFiles } from "./local-env.js";
import { migrateEditorialDraftSchema } from "./editorial-draft-schema.js";

loadDefaultEnvFiles();
const root = resolve(env("LOCAL_EDITORIAL_DRAFT_ROOT", join(env("LOCAL_RUNTIME_REPORTS_ROOT", "reports"), "editorial-drafts")));
if (!existsSync(root)) {
  console.log("Editorial draft schema migration: no draft directory.");
  process.exit(0);
}
let checked = 0;
let migrated = 0;
for (const file of readdirSync(root).filter((name) => name.endsWith(".json")).sort()) {
  const path = join(root, file);
  let original;
  try { original = JSON.parse(readFileSync(path, "utf8")); } catch { continue; }
  checked += 1;
  const result = migrateEditorialDraftSchema(original);
  if (!result.changed) continue;
  const temp = `${path}.migration.tmp`;
  writeFileSync(temp, `${JSON.stringify(result.draft, null, 2)}\n`, "utf8");
  renameSync(temp, path);
  migrated += 1;
}
console.log(`Editorial draft schema migration: checked=${checked}, migrated=${migrated}, publication=forbidden.`);
