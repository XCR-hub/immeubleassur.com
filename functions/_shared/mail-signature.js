export const XCR_MAIL_SIGNATURE = [
  "Cordialement,",
  "Tony CERDA",
  "XCR (EXCELLENCE COVERAGE RISKS)",
  "tcerda@xcr.fr",
  "06 83 52 67 51 / 01 80 85 57 80"
].join("\n");

export function withXcrMailSignature(value) {
  let body = String(value || "").trimEnd();
  if (body.endsWith(XCR_MAIL_SIGNATURE)) return body;
  body = body.replace(/(?:\n(?:Bien\s+)?cordialement,?\s*)?\n(?:L['’](?:equipe|équipe)\s+)?ImmeubleAssur(?:\.com)?(?:\s*\/\s*XCR[^\n]*)?\s*$/i, "").trimEnd();
  return body + "\n\n" + XCR_MAIL_SIGNATURE;
}
