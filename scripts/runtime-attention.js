const ATTENTION_STATUS = /\b(failed|failures?|degraded|action-required|fallback-only|partial|review-aging|review-overdue)\b/i;

export function outputNeedsAttention(stdout = "", stderr = "") {
  const output = `${stdout} ${stderr}`
    .replace(/\b(?:failed|failures?|errors?|attention)\s*[=:]\s*0\b/gi, "")
    .replace(/\b0\s+(?:failed|failures?|errors?)\b/gi, "");
  return ATTENTION_STATUS.test(output);
}
