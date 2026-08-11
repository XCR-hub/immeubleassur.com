import { BlockList, isIP } from "node:net";

const RANGE_SOURCES = {
  googlebot: "https://developers.google.com/static/crawling/ipranges/common-crawlers.json",
  bingbot: "https://www.bing.com/toolbox/bingbot.json",
  "oai-searchbot": "https://openai.com/searchbot.json",
  "chatgpt-user": "https://openai.com/chatgpt-user.json"
};
const rangesCache = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;

function normalizedIp(value) {
  const candidate = String(value || "").trim().replace(/^\[|\]$/g, "");
  if (candidate.startsWith("::ffff:") && isIP(candidate.slice(7)) === 4) return candidate.slice(7);
  return isIP(candidate) ? candidate : "";
}

export function addressInPrefixes(address, prefixes = []) {
  const ip = normalizedIp(address);
  const family = isIP(ip);
  if (!family) return false;
  const blockList = new BlockList();
  for (const row of prefixes) {
    const prefix = String(family === 4 ? row?.ipv4Prefix || "" : row?.ipv6Prefix || "");
    const [network, lengthText] = prefix.split("/");
    const length = Number.parseInt(lengthText, 10);
    if (!network || !Number.isInteger(length)) continue;
    try {
      blockList.addSubnet(network, length, family === 4 ? "ipv4" : "ipv6");
    } catch {}
  }
  return blockList.check(ip, family === 4 ? "ipv4" : "ipv6");
}

async function officialPrefixes(sourceUrl, fetchImpl) {
  const cached = rangesCache.get(sourceUrl);
  if (cached && Date.now() - cached.loaded_at < CACHE_MS) return cached.prefixes;
  const response = await fetchImpl(sourceUrl, {
    headers: { "User-Agent": "ImmeubleAssurCrawlerVerifier/1.0 (+https://immeubleassur.com/methodologie-editoriale)" },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`official crawler ranges HTTP ${response.status}`);
  const body = await response.json();
  const prefixes = Array.isArray(body?.prefixes) ? body.prefixes : [];
  if (!prefixes.length) throw new Error("official crawler ranges empty");
  rangesCache.set(sourceUrl, { loaded_at: Date.now(), prefixes });
  return prefixes;
}

export async function verifyCrawlerAddress(crawler, address, options = {}) {
  const ip = normalizedIp(address);
  const sourceUrl = RANGE_SOURCES[crawler] || "";
  if (!ip) return { verified: false, method: "no-trusted-source-address", source_url: "", ip_stored: false };
  if (!sourceUrl) return { verified: false, method: "official-range-unavailable-for-agent", source_url: "", ip_stored: false };
  try {
    const prefixes = await officialPrefixes(sourceUrl, options.fetchImpl || fetch);
    return {
      verified: addressInPrefixes(ip, prefixes),
      method: "official-ip-range",
      source_url: sourceUrl,
      ip_stored: false
    };
  } catch {
    return { verified: false, method: "official-range-check-unavailable", source_url: sourceUrl, ip_stored: false };
  }
}

export function trustedCrawlerSourceAddress(request) {
  const cloudflareAddress = normalizedIp(request?.headers?.["cf-connecting-ip"]);
  const cloudflareRay = String(request?.headers?.["cf-ray"] || "").trim();
  const proxyAddress = normalizedIp(request?.socket?.remoteAddress);
  const localProxy = proxyAddress === "127.0.0.1" || proxyAddress === "::1";
  if (cloudflareAddress && cloudflareRay && localProxy) return { address: cloudflareAddress, transport: "cloudflare-local-tunnel" };
  return { address: "", transport: "untrusted-or-unavailable" };
}

export const crawlerVerificationSources = Object.freeze({ ...RANGE_SOURCES });
