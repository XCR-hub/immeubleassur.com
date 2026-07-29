import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPORT_DIR = "reports";
const expectations = [
  {
    file: "scripts/search-intelligence.js",
    snippets: ["loadDefaultEnvFiles", "SERP_API_KEY", "--serp"]
  },
  {
    file: "scripts/media-autopilot.js",
    snippets: ["loadDefaultEnvFiles", "PEXELS_API_KEY", "--fetch"]
  },
  {
    file: "scripts/editorial-autopilot.js",
    snippets: ["loadDefaultEnvFiles", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "--ai"]
  },
  {
    file: "scripts/turnstile-hybrid-pass.js",
    snippets: ["loadDefaultEnvFiles", "TURNSTILE_SITE_KEY", "turnstile-hybrid"]
  },
  {
    file: "scripts/seo-autopilot.js",
    snippets: [
      "urlInspectionTargets",
      "url_inspections",
      "inspectionNeedsAction",
      "buildGoogleApiHealth",
      "google_api_health",
      "searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      "sitemap_submission",
      "sitemaps/${encodeURIComponent(sitemapUrl)}"
    ]
  },
  {
    file: "public/assets/admin.js",
    snippets: ["Search Console", "URL Inspection", "Sitemap Google", "google_api_health"]
  },
  {
    file: "package.json",
    snippets: ["--url-inspection", "--submit-sitemap", "google:apis", "seo:live", "search:live", "media:live", "editorial:live", "google-api-contract-check.js"]
  },
  {
    file: ".github/workflows/seo-autopilot.yml",
    snippets: ["GOOGLE_URL_INSPECTION_LIMIT", "npm run seo:apis"]
  },
  {
    file: "README.md",
    snippets: ["Google Search Console", "PageSpeed", "GOOGLE_URL_INSPECTION_LIMIT"]
  },
  {
    file: ".env.example",
    snippets: ["GOOGLE_URL_INSPECTION_LIMIT", "GOOGLE_URL_INSPECTION_URLS"]
  }
];

const missing = [];
for (const expectation of expectations) {
  const source = readFileSync(expectation.file, "utf8");
  for (const snippet of expectation.snippets) {
    if (!source.includes(snippet)) missing.push({ file: expectation.file, snippet });
  }
}

const report = {
  generated_at: new Date().toISOString(),
  checked_files: expectations.map((item) => item.file),
  required_markers: expectations.reduce((sum, item) => sum + item.snippets.length, 0),
  missing,
  status: missing.length ? "failed" : "passed"
};

mkdirSync(REPORT_DIR, { recursive: true });
writeFileSync(join(REPORT_DIR, "google-api-contract-report.json"), JSON.stringify(report, null, 2), "utf8");

if (missing.length) {
  console.error(`Google API contract failed: ${missing.map((item) => `${item.file}:${item.snippet}`).join(", ")}`);
  process.exit(1);
}

console.log(`Google API contract passed for ${report.required_markers} required markers.`);