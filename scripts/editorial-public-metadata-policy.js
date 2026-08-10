function parsePublicDate(value) {
  const normalized = String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return null;
  const months = { janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11 };
  const french = normalized.match(/\b(\d{1,2})\s+([a-z]+)\s+(20\d{2})\b/i);
  if (french && months[french[2]] !== undefined) {
    const year = Number(french[3]);
    const month = months[french[2]];
    const day = Number(french[1]);
    const candidate = new Date(Date.UTC(year, month, day));
    return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month && candidate.getUTCDate() === day ? candidate : null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function sanitizePublicWatchItems(items, now = new Date()) {
  const maximumFutureMs = 6 * 3600000;
  return (Array.isArray(items) ? items : []).map(({ source_id, source_name, title, url, topic, relevance_score, published_at }) => {
    const parsedDate = parsePublicDate(published_at);
    const isFutureDate = parsedDate && parsedDate.getTime() - now.getTime() > maximumFutureMs;
    return { source_id, source_name, title, url, topic, relevance_score, published_at: isFutureDate ? "" : published_at };
  });
}