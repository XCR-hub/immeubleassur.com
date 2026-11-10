const POLICIES = {
  google_search_console: { owner: "configuration", intervention: "human-required", action: "Configurer GOOGLE_SERVICE_ACCOUNT_EMAIL et GOOGLE_SERVICE_ACCOUNT_KEY sans exposer leurs valeurs dans les rapports." },
  serp_measurement: { owner: "automation", intervention: "automatic-retry", action: "Reevaluer la mesure au prochain cycle; ne jamais traiter les positions de repli comme mesurees." },
  editorial_review_sla: { owner: "editorial-legal-review", intervention: "human-required", action: "Relire les brouillons prioritaires; aucune interpretation juridique IA ne doit etre publiee automatiquement." },
  imap_inbox_review: { owner: "lead-operations", intervention: "human-required", action: "Classer les messages non rapproches sans lire ni exporter leur contenu dans la supervision." },
  lead_sla: { owner: "lead-operations", intervention: "human-required", action: "Traiter les prospects en retard dans l'administration; les rappels automatiques restent suspendus a la demande de l'utilisateur." },
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
      const measurementAge = Number.isFinite(item.age_minutes) ? Math.max(0, item.age_minutes) : 0;
      const automaticRetryAt = item.name === "serp_measurement" && Number.isFinite(generated) ? new Date(generated + Math.max(0, 360 - measurementAge) * 60 * 1000).toISOString() : "";
      const quotaDate = /^\d{4}-\d{2}-\d{2}$/.test(item.quota_renewal_date || "") ? item.quota_renewal_date : "";
      const action = item.name === "serp_measurement" && item.status === "serpapi-quota-exhausted" && item.quota_remaining === 0
        ? `Quota SerpApi epuise; verifier les credits toutes les six heures sans lancer de recherche sans credit.${quotaDate ? ` Renouvellement annonce le ${quotaDate}.` : ""} Aucun classement de repli n'est une mesure.`
        : policy.action;
      return {
        check: String(item.name || "unknown"),
        priority: item.severity === "warn" ? "warning" : "critical",
        owner: policy.owner,
        intervention: policy.intervention,
        action,
        reason: String(item.reason || item.status || item.error || "failed"),
        due_at: proofDueAt || automaticRetryAt,
        contains_personal_data: false,
        secret_values_exported: false
      };
    })
    .sort((a, b) => (a.priority === b.priority ? a.check.localeCompare(b.check) : a.priority === "critical" ? -1 : 1));
}
