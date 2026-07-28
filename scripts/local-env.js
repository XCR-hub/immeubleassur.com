import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(file) {
  if (!existsSync(file)) return false;
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value.replace(/\\n/g, "\n");
  }
  return true;
}

export function loadDefaultEnvFiles() {
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    loadEnvFile(file);
  }
}

export function env(name, fallback = "") {
  return process.env[name] || fallback;
}
