export function normalizeGoogleSiteVerificationFile(value) {
  const file = String(value || "").trim();
  return /^google[a-zA-Z0-9_-]{8,128}\.html$/.test(file) ? file : "";
}

export function googleSiteVerificationBody(pathname, configuredFile) {
  const file = normalizeGoogleSiteVerificationFile(configuredFile);
  return file && pathname === `/${file}` ? `google-site-verification: ${file}` : "";
}
