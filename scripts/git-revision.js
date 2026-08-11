import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

const SHA1 = /^[a-f0-9]{40}$/i;
const SAFE_REF = /^refs\/[A-Za-z0-9._\/-]+$/;

function readText(path) {
  try { return readFileSync(path, "utf8").trim(); } catch { return ""; }
}

function resolveGitDirectory(root) {
  const marker = resolve(root, ".git");
  try {
    if (statSync(marker).isDirectory()) return marker;
    const pointer = readText(marker);
    if (!pointer.toLowerCase().startsWith("gitdir:")) return "";
    return resolve(dirname(marker), pointer.slice(pointer.indexOf(":") + 1).trim());
  } catch { return ""; }
}

function commonGitDirectory(gitDir) {
  const pointer = readText(join(gitDir, "commondir"));
  if (!pointer) return "";
  return isAbsolute(pointer) ? resolve(pointer) : resolve(gitDir, pointer);
}

function packedRevision(gitDir, reference) {
  const packed = readText(join(gitDir, "packed-refs"));
  for (const line of packed.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line.startsWith("^")) continue;
    const [revision, name] = line.trim().split(/\s+/, 2);
    if (name === reference && SHA1.test(revision)) return revision.toLowerCase();
  }
  return "";
}

export function readGitRevision(root = process.cwd()) {
  const gitDir = resolveGitDirectory(root);
  if (!gitDir || !existsSync(gitDir)) return "";
  const head = readText(join(gitDir, "HEAD"));
  if (SHA1.test(head)) return head.toLowerCase();
  if (!head.startsWith("ref: ")) return "";
  const reference = head.slice(5).trim();
  if (!SAFE_REF.test(reference) || reference.includes("..") || reference.includes("\\")) return "";
  const commonDir = commonGitDirectory(gitDir);
  const roots = [...new Set([gitDir, commonDir].filter(Boolean))];
  for (const candidate of roots) {
    const loose = readText(join(candidate, ...reference.split("/")));
    if (SHA1.test(loose)) return loose.toLowerCase();
  }
  for (const candidate of roots) {
    const packed = packedRevision(candidate, reference);
    if (packed) return packed;
  }
  return "";
}

