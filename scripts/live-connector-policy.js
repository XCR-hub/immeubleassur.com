function retryAfterMinutes(value, now = Date.now()) {
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Math.ceil(Number(text) / 60);
  const retryAt = Date.parse(text);
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - now) / 60000)) : 0;
}

export function serpCooldownDecision(report, options = {}) {
  if (options.force === true || report?.rate_limited !== true) return null;
  const now = Number(options.now || Date.now());
  const generatedAt = Date.parse(report.generated_at || "");
  if (!Number.isFinite(generatedAt)) return null;
  const configuredMinutes = Math.max(15, Number(options.cooldownMinutes || 360) || 360);
  const providerMinutes = retryAfterMinutes(report.retry_after, generatedAt);
  const effectiveCooldownMinutes = Math.max(configuredMinutes, providerMinutes);
  const ageMinutes = Math.max(0, (now - generatedAt) / 60000);
  if (ageMinutes >= effectiveCooldownMinutes) return null;
  return {
    reason: "serpapi-rate-limit-cooldown",
    age_minutes: Math.round(ageMinutes),
    cooldown_minutes: effectiveCooldownMinutes,
    configured_cooldown_minutes: configuredMinutes,
    provider_retry_after_minutes: providerMinutes,
    next_retry_after_minutes: Math.max(0, Math.ceil(effectiveCooldownMinutes - ageMinutes))
  };
}
