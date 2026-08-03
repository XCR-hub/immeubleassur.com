import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function safeName(value) {
  return basename(String(value || "document.bin")).replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120) || "document.bin";
}

function engineArgs(binary, target) {
  const name = String(binary || "").toLowerCase();
  if (name.includes("mpcmdrun")) return ["-Scan", "-ScanType", "3", "-File", target];
  return ["--no-summary", "--infected", target];
}

function providerFor(binary) {
  return String(binary || "").toLowerCase().includes("mpcmdrun") ? "windows-defender" : "clamav";
}

export function createLocalDocumentScanner({ binary = "", fallbackBinary = "", timeoutMs = 30000 } = {}) {
  const engines = [binary, fallbackBinary].map((item) => String(item || "").trim()).filter((item, index, list) => item && list.indexOf(item) === index);
  return async function scanDocument({ bytes, fileName } = {}) {
    const available = engines.filter((item) => existsSync(item));
    if (!available.length) return { status: "unavailable", provider: "clamav+windows-defender", reason: "binary_missing" };
    if (!(bytes instanceof Uint8Array) || !bytes.length) return { status: "error", provider: "document-scanner", reason: "empty_payload" };
    const directory = await mkdtemp(join(tmpdir(), "immeubleassur-scan-"));
    const target = join(directory, safeName(fileName));
    try {
      await writeFile(target, bytes);
      for (const executable of available) {
        const provider = providerFor(executable);
        try {
          await execFileAsync(executable, engineArgs(executable, target), { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 });
          return { status: "clean", provider };
        } catch (error) {
          if (Number(error?.code) === 1 && provider === "clamav") return { status: "infected", provider };
          if (provider === "windows-defender" && Number(error?.code) === 2) {
            const output = String(error?.stdout || "") + " " + String(error?.stderr || "");
            if (/(threat|malware|infected|virus|found)/.test(output.toLowerCase())) return { status: "infected", provider };
          }
        }
      }
      return { status: "unavailable", provider: "clamav+windows-defender", reason: "scan_unavailable" };
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  };
}