import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

export function sourceSetFingerprint(items) {
  const identities = [...new Set((Array.isArray(items) ? items : []).map((item) => String(item?.url || "").trim()).filter(Boolean))].sort();
  if (!identities.length) return "";
  return createHash("sha256").update(identities.join("\n")).digest("hex");
}

export function findEquivalentPendingDraft(draftsRoot, items) {
  const target = sourceSetFingerprint(items);
  if (!target || !existsSync(draftsRoot)) return null;
  const candidates = readdirSync(draftsRoot).filter((name) => /^news-.*\.json$/i.test(name)).sort().reverse();
  for (const name of candidates) {
    try {
      const draft = JSON.parse(readFileSync(join(draftsRoot, name), "utf8"));
      if (draft.marker !== "editorial-ai-draft-review-v1" || draft.publication_status !== "quarantined" || draft.human_review_required !== true || draft.no_auto_publish !== true || draft.allowed_publication === true) continue;
      if (sourceSetFingerprint(draft.source_items) === target) return { file: basename(name), generated_at: draft.generated_at || "" };
    } catch {}
  }
  return null;
}
