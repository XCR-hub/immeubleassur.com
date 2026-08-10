const LEGAL_TERMS = ["loi", "decret", "arrete", "code civil", "code des assurances", "jurisprudence", "obligation", "obligatoire", "responsabilite", "reglementaire", "legifrance", "service-public"];

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function migrateEditorialDraftSchema(draft) {
  if (!draft || draft.publication_status !== "draft_review" || draft.human_review_required !== true || draft.no_auto_publish !== true) return { changed: false, draft };
  const corpus = normalized(JSON.stringify({ issue: draft.issue, synthesis: draft.synthesis, source_items: draft.source_items, source_context: draft.source_context, drafts: draft.drafts }));
  const matched_terms = LEGAL_TERMS.filter((term) => corpus.includes(term));
  return { changed: true, draft: { ...draft, publication_status: "quarantined", allowed_publication: false, legal_review: { sensitive: matched_terms.length > 0, matched_terms, publication_gate: matched_terms.length ? "legal-human-approval" : "editorial-human-approval", human_review_required: true, allowed_publication: false, public_interpretation_allowed: false }, schema_migration: "editorial-quarantine-v2" } };
}
