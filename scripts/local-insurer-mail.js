import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function decryptWindowsPassword(ciphertext) {
  const script = "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $encrypted=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $clear=[System.Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[System.Security.Cryptography.DataProtectionScope]::LocalMachine); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($clear))";
  const result = spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { input: ciphertext, encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 65536 });
  if (result.error || result.status !== 0 || !result.stdout) throw new Error("Identifiants assureur chiffrés indisponibles sur ce serveur");
  return result.stdout;
}

export function loadInsurerMailConfiguration(env = process.env, { read = readFileSync, decrypt = decryptWindowsPassword } = {}) {
  const file = String(env.INSURER_MAIL_CONFIG_PATH || "").trim();
  if (!file) return { configured: false };
  const config = JSON.parse(read(file, "utf8").replace(/^\uFEFF/, ""));
  if (config.username !== "tcerda@xcr.fr" || config.sender !== "tcerda@xcr.fr") throw new Error("Le compte assureur doit être tcerda@xcr.fr");
  if (config.password_protection !== "Windows DPAPI LocalMachine" || !config.password_dpapi) throw new Error("Protection des identifiants assureur non prise en charge");
  if (!config.smtp?.host || ![465, 587].includes(Number(config.smtp.port))) throw new Error("Configuration SMTP assureur invalide");
  const password = decrypt(config.password_dpapi);
  if (!password || typeof password !== "string") throw new Error("Mot de passe assureur indisponible");
  Object.assign(env, { INSURER_SMTP_HOST: String(config.smtp.host), INSURER_SMTP_PORT: String(config.smtp.port), INSURER_SMTP_USER: config.username, INSURER_SMTP_PASS: password });
  return { configured: true, from: config.sender };
}
