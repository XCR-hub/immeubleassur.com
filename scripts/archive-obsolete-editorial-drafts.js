import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const hash = (value) => createHash("sha256").update(value).digest("hex");

export function archiveObsoleteDrafts({ draftsRoot, backupRoot, before, apply = false, now = Date.now() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before || "")) throw new Error("An explicit edition cutoff is required");
  const cutoff = Date.parse(before + "T00:00:00.000Z");
  if (!Number.isFinite(cutoff) || new Date(cutoff).toISOString().slice(0, 10) !== before || cutoff > now - 60 * 86400000) throw new Error("Only editions older than 60 days can be archived");
  const root = resolve(draftsRoot);
  const backup = backupRoot ? resolve(backupRoot) : null;
  const backupRelative = backup ? relative(root, backup) : "";
  if (apply && (!backup || !(isAbsolute(backupRelative) || backupRelative === ".." || backupRelative.startsWith(".." + sep)))) throw new Error("A separate private backup directory is required");
  const rows = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !/^news-.*\.json$/.test(entry.name)) continue;
    const path = join(root, entry.name);
    const original = readFileSync(path);
    let draft;
    try { draft = JSON.parse(original.toString("utf8")); } catch { continue; }
    const issueDate = draft.issue?.slug?.match(/^news\/veille-assurance-immeuble-(\d{4}-\d{2}-\d{2})$/)?.[1];
    const generated = Date.parse(draft.generated_at || "");
    const edition = issueDate ? Date.parse(issueDate + "T00:00:00.000Z") : NaN;
    if (draft.marker !== "editorial-ai-draft-review-v1" || !["quarantined", "draft_review"].includes(draft.publication_status)
      || draft.human_review_required !== true || draft.no_auto_publish !== true || draft.allowed_publication !== false
      || !Number.isFinite(generated) || !Number.isFinite(edition) || generated >= cutoff || edition >= cutoff) continue;
    const sha256 = hash(original);
    if (apply) {
      mkdirSync(backup, { recursive: true });
      const saved = join(backup, entry.name);
      if (!existsSync(saved)) writeFileSync(saved, original, { flag: "wx" });
      if (hash(readFileSync(saved)) !== sha256) throw new Error("The existing archive backup does not match the pending draft");
      const next = { ...draft, publication_status: "archived_obsolete", editorial_archive: {
        marker: "editorial-obsolete-archive-v1", archived_at: new Date(now).toISOString(),
        actor: "codex-delegated-maintenance", reason: "Obsolete news edition; no legal validation or publication approval",
        cutoff_edition: before, original_status: draft.publication_status, original_sha256: sha256,
        restorable_original: true, human_approval_granted: false, automatic_publication: false
      } };
      const temporary = path + "." + randomUUID() + ".tmp";
      try {
        writeFileSync(temporary, JSON.stringify(next, null, 2) + "\n", { flag: "wx" });
        if (hash(readFileSync(path)) !== sha256) throw new Error("Draft changed during archival; retry after reviewing the new version");
        renameSync(temporary, path);
      } finally { if (existsSync(temporary)) rmSync(temporary); }
    }
    rows.push({ file: entry.name, edition: issueDate, original_sha256: sha256, archived: apply });
  }
  return { generated_at: new Date(now).toISOString(), status: apply ? "archived" : "dry-run", cutoff_edition: before,
    eligible: rows.length, archived: apply ? rows.length : 0, rows,
    safeguards: ["explicit-cutoff", "minimum-60-day-age", "hash-verified-original-backup", "no-content-deletion", "no-human-approval", "publication-remains-blocked"] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const value = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
  const report = archiveObsoleteDrafts({ draftsRoot: value("--drafts-root"), backupRoot: value("--backup-root"), before: value("--before"), apply: process.argv.includes("--apply") });
  const out = value("--out");
  if (out) { mkdirSync(dirname(resolve(out)), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + "\n"); }
  console.log(`Obsolete editorial drafts ${report.status}: eligible=${report.eligible}, archived=${report.archived}.`);
}
