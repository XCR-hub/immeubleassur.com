import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const KNOWN_CRAWLERS = new Set(["googlebot", "bingbot", "oai-searchbot", "chatgpt-user", "perplexitybot", "perplexity-user", "claude-searchbot", "claude-user"]);

function summarizeCrawlerObservations(dbPath, lookbackDays = 30) {
  const days = Math.max(1, Math.min(365, Number(lookbackDays) || 30));
  const base = { available: false, lookback_days: days, status: "unavailable", observed_agents: 0, verified_agents: 0, observation_count: 0, verified_observation_count: 0, agents: [], privacy: "no-ip-no-query-no-raw-user-agent" };
  if (!dbPath || !existsSync(dbPath)) return base;
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const table = database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'site_events'").get();
    if (!table) return { ...base, status: "schema-unavailable" };
    const rows = database.prepare("SELECT lower(target) AS agent, COUNT(*) AS count, SUM(CASE WHEN COALESCE(json_extract(payload, '$.identity_verified'), 0) = 1 THEN 1 ELSE 0 END) AS verified_count, MAX(created_at) AS last_seen_at, MAX(CASE WHEN COALESCE(json_extract(payload, '$.identity_verified'), 0) = 1 THEN created_at ELSE NULL END) AS last_verified_at FROM site_events WHERE event_type = 'crawler_observation' AND created_at >= datetime('now', ?) GROUP BY lower(target) ORDER BY lower(target)").all(`-${days} days`).filter((row) => KNOWN_CRAWLERS.has(String(row.agent || "")));
    const agents = rows.map((row) => ({ agent: row.agent, count: Number(row.count || 0), verified_count: Number(row.verified_count || 0), last_seen_at: row.last_seen_at || "", last_verified_at: row.last_verified_at || "" }));
    const verifiedObservationCount = agents.reduce((sum, row) => sum + row.verified_count, 0);
    return { ...base, available: true, status: verifiedObservationCount ? "verified-observed" : agents.length ? "unverified-only" : "not-observed", observed_agents: agents.length, verified_agents: agents.filter((row) => row.verified_count > 0).length, observation_count: agents.reduce((sum, row) => sum + row.count, 0), verified_observation_count: verifiedObservationCount, agents };
  } catch {
    return { ...base, status: "query-unavailable" };
  } finally {
    database.close();
  }
}

export { summarizeCrawlerObservations };
