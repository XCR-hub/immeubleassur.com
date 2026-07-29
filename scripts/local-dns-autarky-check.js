import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDefaultEnvFiles } from "./local-env.js";
import dns from "node:dns/promises";

loadDefaultEnvFiles();

const DOMAIN = process.env.DNS_DOMAIN || "immeubleassur.com";
const EXPECTED_A = process.env.DNS_EXPECTED_A || "80.15.56.123";
const REPORT_PATH = process.env.DNS_AUTARKY_REPORT || join("reports", "dns-autarky-report.json");
const RECORDS_FILE = process.env.DNS_RECORDS_FILE || join("dns", "registrar-records.json");
const RESOLVERS = String(process.env.DNS_RESOLVERS || "9.9.9.9,8.8.8.8").split(",").map((item) => item.trim()).filter(Boolean);
const STRICT = process.argv.includes("--strict");

if (RESOLVERS.length) dns.setServers(RESOLVERS);

async function resolveSafe(type, name) {
  try {
    if (type === "A") return await dns.resolve4(name);
    if (type === "NS") return await dns.resolveNs(name);
    if (type === "MX") return await dns.resolveMx(name);
    if (type === "TXT") return (await dns.resolveTxt(name)).map((row) => row.join(""));
    return [];
  } catch (error) {
    return { error: error.code || error.message || "resolve-failed" };
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function lowerRows(rows) {
  return asArray(rows).map((item) => String(item.exchange || item).replace(/\.$/, "").toLowerCase());
}

function readPlannedRecords() {
  if (!existsSync(RECORDS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(RECORDS_FILE, "utf8"));
  } catch (error) {
    return { error: error.message || "invalid-records-json" };
  }
}

const [aRecords, nsRecords, mxRecords, txtRecords, dmarcRecords] = await Promise.all([
  resolveSafe("A", DOMAIN),
  resolveSafe("NS", DOMAIN),
  resolveSafe("MX", DOMAIN),
  resolveSafe("TXT", DOMAIN),
  resolveSafe("TXT", `_dmarc.${DOMAIN}`)
]);

const ns = lowerRows(nsRecords);
const mx = lowerRows(mxRecords);
const cloudflareNameservers = ns.filter((item) => item.endsWith("cloudflare.com"));
const aOk = asArray(aRecords).includes(EXPECTED_A);
const resolverErrors = [aRecords.error, nsRecords.error, mxRecords.error, txtRecords.error, dmarcRecords.error].filter(Boolean);
const resolverOk = asArray(aRecords).length > 0 || asArray(nsRecords).length > 0;
const registrarMigrationRequired = cloudflareNameservers.length > 0;
const planned = readPlannedRecords();
const status = !resolverOk ? "resolver-error" : !aOk ? "ip-mismatch" : registrarMigrationRequired ? "registrar-migration-required" : "passed";

const report = {
  generated_at: new Date().toISOString(),
  domain: DOMAIN,
  fixed_ipv4: EXPECTED_A,
  resolvers: RESOLVERS,
  status,
  checks: {
    a_record: {
      expected: EXPECTED_A,
      observed: asArray(aRecords),
      ok: aOk,
      error: aRecords.error || ""
    },
    nameservers: {
      observed: ns,
      cloudflare_present: registrarMigrationRequired,
      cloudflare_nameservers: cloudflareNameservers,
      error: nsRecords.error || ""
    },
    mail: {
      observed_mx: mx,
      txt_spf_present: asArray(txtRecords).some((item) => item.toLowerCase().startsWith("v=spf1")),
      dmarc_present: asArray(dmarcRecords).some((item) => item.toLowerCase().startsWith("v=dmarc1")),
      mx_error: mxRecords.error || "",
      txt_error: txtRecords.error || "",
      dmarc_error: dmarcRecords.error || ""
    }
  },
  planned_records: planned,
  next_action: !resolverOk
    ? `Resolution DNS impossible depuis ce poste (${resolverErrors.join(", ") || "erreur inconnue"}). Relancer avec DNS_RESOLVERS ou verifier via Resolve-DnsName.`
    : registrarMigrationRequired
      ? "IP fixe OK: recopier dns/registrar-records.json chez le registrar, puis remplacer les nameservers Cloudflare."
      : "DNS hors Cloudflare detecte: conserver le controle A/MX/SPF/DMARC apres propagation."
};

mkdirSync(join(REPORT_PATH, ".."), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`DNS autarky ${report.status}: A=${asArray(aRecords).join(",") || "none"}, NS=${ns.join(",") || "none"}`);
console.log(`Report: ${REPORT_PATH}`);

if (STRICT && report.status !== "passed") process.exit(1);