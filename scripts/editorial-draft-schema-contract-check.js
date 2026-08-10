import { migrateEditorialDraftSchema } from "./editorial-draft-schema.js";

const content = { title: "Synthese", points: ["Obligation à vérifier sur Legifrance"], provider: "ai" };
const legacy = { marker: "editorial-ai-draft-review-v1", publication_status: "draft_review", human_review_required: true, no_auto_publish: true, synthesis: content };
const legal = migrateEditorialDraftSchema(legacy);
const neutral = migrateEditorialDraftSchema({ ...legacy, synthesis: { title: "Entretien toiture", points: ["Comparer les devis"] } });
const modern = { ...legacy, publication_status: "quarantined", allowed_publication: false };
const unsafe = { ...legacy, no_auto_publish: false };
const checks = [
  legal.changed === true,
  legal.draft.publication_status === "quarantined" && legal.draft.allowed_publication === false,
  legal.draft.legal_review.sensitive === true && legal.draft.legal_review.publication_gate === "legal-human-approval",
  legal.draft.legal_review.public_interpretation_allowed === false,
  JSON.stringify(legal.draft.synthesis) === JSON.stringify(content),
  neutral.draft.legal_review.sensitive === false && neutral.draft.legal_review.publication_gate === "editorial-human-approval",
  migrateEditorialDraftSchema(modern).changed === false,
  migrateEditorialDraftSchema(unsafe).changed === false
];
const passed = checks.filter(Boolean).length;
console.log(`Editorial draft schema contract: ${passed === checks.length ? "passed" : "failed"} (${passed}/${checks.length}).`);
if (passed !== checks.length) process.exit(1);
