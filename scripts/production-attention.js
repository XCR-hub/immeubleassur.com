const POLICIES = {
  google_search_console: { owner: "configuration", intervention: "human-required", action: "Configurer GOOGLE_SERVICE_ACCOUNT_EMAIL et GOOGLE_SERVICE_ACCOUNT_KEY sans exposer leurs valeurs dans les rapports." },
  serp_measurement: { owner: "automation", intervention: "automatic-retry", action: "Reevaluer la mesure au prochain cycle; ne jamais traiter les positions de repli comme mesurees." },
  editorial_review_sla: { owner: "editorial-legal-review", intervention: "human-required", action: "Relire les brouillons prioritaires; aucune interpretation juridique IA ne doit etre publiee automatiquement." },
  imap_inbox_review: { owner: "lead-operations", intervention: "human-required", action: "Classer les messages non rapproches sans lire ni exporter leur contenu dans la supervision." },
  github_workflow_health: { owner: "automation", intervention: "automatic-proof", action: "Attendre la prochaine execution planifiee puis verifier sa conclusion." }
};

function isoOrEmpty(value) {
  const time = new Date(value || "").getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

export function buildProductionAttention(checks, generatedAt = new Date().toISOString()) {
  const generated = new Date(generatedAt).getTime();
  return (Array.isArray(checks) ? checks : [])
    .filter((item) => item && item.ok === false)
    .map((item) => {
      const policy = POLICIES[item.name] || { owner: "operations", intervention: "investigate", action: "Examiner la preuve du controle et corriger la cause avant d'acquitter l'alerte." };
      const proofDueAt = isoOrEmpty(item.proof_due_at);
      const automaticRetryAt = item.name === "serp_measurement" && Number.isFinite(generated) ? new Date(generated + 60 * 60 * 1000).toISOString() : "";
      return {
        check: String(item.name || "unknown"),
        priority: item.severity === "warn" ? "warning" : "critical",
        owner: policy.owner,
        intervention: policy.intervention,
        action: policy.action,
        reason: String(item.reason || item.status || item.error || "failed"),
        due_at: proofDueAt || automaticRetryAt,
        contains_personal_data: false,
        secret_values_exported: false
      };
    })
    .sort((a, b) => (a.priority === b.priority ? a.check.localeCompare(b.check) : a.priority === "critical" ? -1 : 1));
}
