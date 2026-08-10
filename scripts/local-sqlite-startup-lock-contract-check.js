import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { openLocalSqlite } from "./local-sqlite-db.js";

if (process.argv.includes("--holder")) {
  const database = new DatabaseSync(process.argv.at(-1));
  database.exec("BEGIN EXCLUSIVE");
  process.stdout.write("locked\n");
  setTimeout(() => { database.exec("COMMIT"); database.close(); }, 800);
} else {
  const root = mkdtempSync(join(tmpdir(), "immeubleassur-sqlite-lock-"));
  const dbPath = join(root, "startup.sqlite");
  const seed = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
  seed.close();
  try {
    const holder = spawn(process.execPath, [process.argv[1], "--holder", dbPath], { stdio: ["ignore", "pipe", "inherit"] });
    const holderExit = new Promise((resolve) => holder.once("exit", resolve));
    await new Promise((resolve, reject) => {
      holder.once("error", reject);
      holder.stdout.once("data", (chunk) => String(chunk).includes("locked") ? resolve() : reject(new Error("lock holder did not confirm")));
    });
    const started = Date.now();
    const database = openLocalSqlite({ dbPath, schemaPath: "schema.sql" });
    const elapsed = Date.now() - started;
    assert(elapsed >= 500 && elapsed < 5000, `startup lock wait outside bounds: ${elapsed}ms`);
    assert.equal(database.health().tables.includes("brokerage_cases"), true);
    database.close();
    await holderExit;
    console.log(`SQLite startup lock contract: passed (waited ${elapsed}ms).`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
