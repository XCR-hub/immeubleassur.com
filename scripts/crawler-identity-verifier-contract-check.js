import { readFileSync } from "node:fs";
import { addressInPrefixes, crawlerVerificationSources, trustedCrawlerSourceAddress, verifyCrawlerAddress } from "./crawler-identity-verifier.js";

const fixturePrefixes = [
  { ipv4Prefix: "104.210.140.128/28" },
  { ipv6Prefix: "2001:db8:abcd::/48" }
];
const fetchImpl = async () => ({
  ok: true,
  async json() { return { prefixes: fixturePrefixes }; }
});
const verified = await verifyCrawlerAddress("oai-searchbot", "104.210.140.130", { fetchImpl });
const rejected = await verifyCrawlerAddress("oai-searchbot", "104.210.141.1", { fetchImpl });
const unsupported = await verifyCrawlerAddress("claude-searchbot", "203.0.113.1", { fetchImpl });
const trusted = trustedCrawlerSourceAddress({ headers: { "cf-connecting-ip": "104.210.140.130", "cf-ray": "test-ray" }, socket: { remoteAddress: "127.0.0.1" } });
const spoofable = trustedCrawlerSourceAddress({ headers: { "cf-connecting-ip": "104.210.140.130", "cf-ray": "test-ray" }, socket: { remoteAddress: "192.168.1.25" } });
const server = readFileSync("scripts/local-production-server.js", "utf8");
const monitor = readFileSync("scripts/local-production-monitor.js", "utf8");
const observationSummary = readFileSync("scripts/crawler-observation-summary.js", "utf8");

const checks = [
  ["ipv4-prefix-match", addressInPrefixes("104.210.140.130", fixturePrefixes)],
  ["ipv4-prefix-reject", !addressInPrefixes("104.210.141.1", fixturePrefixes)],
  ["ipv6-prefix-match", addressInPrefixes("2001:db8:abcd::42", fixturePrefixes)],
  ["invalid-address-reject", !addressInPrefixes("not-an-ip", fixturePrefixes)],
  ["official-openai-range-verifies", verified.verified === true && verified.method === "official-ip-range" && verified.ip_stored === false],
  ["outside-range-does-not-verify", rejected.verified === false],
  ["unsupported-agent-does-not-verify", unsupported.verified === false && unsupported.method === "official-range-unavailable-for-agent"],
  ["cloudflare-pair-required", trusted.address === "104.210.140.130" && trusted.transport === "cloudflare-local-tunnel" && spoofable.address === ""],
  ["official-primary-sources-recorded", crawlerVerificationSources.googlebot.includes("developers.google.com") && crawlerVerificationSources.bingbot.includes("bing.com") && crawlerVerificationSources["oai-searchbot"] === "https://openai.com/searchbot.json"],
  ["server-never-persists-source-ip", server.includes("ip_address, user_agent") && server.includes("VALUES (?, 'crawler_observation', ?, ?, ?, '', ?") && server.includes("ip_stored: false")],
  ["verified-and-unverified-dedupe-distinct", server.includes("json_extract(payload, '$.identity_verified')") && server.includes("verifiedValue")],
  ["monitor-separates-verified-observations", monitor.includes("summarizeCrawlerObservations(dbPath, 30)") && monitor.includes("crawler_verified_agents_30d: crawlerSummary.verified_agents") && observationSummary.includes("verified_count") && observationSummary.includes("last_verified_at") && observationSummary.includes("verified_observation_count")]
];
const missing = checks.filter(([, ok]) => !ok).map(([name]) => name);
console.log(`Crawler identity verifier contract: ${missing.length ? "failed" : "passed"} (${checks.length - missing.length}/${checks.length}).`);
if (missing.length) {
  console.error(missing.join(", "));
  process.exitCode = 1;
}
