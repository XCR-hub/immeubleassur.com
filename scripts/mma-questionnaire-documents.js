import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import JSZip from "jszip";
import { questionnaireSections, displayAnswer, unresolvedAnswers } from "../functions/_shared/immeuble-questionnaire-schema.js";
import { sendNodeSmtpMail, requireOperationalTeamRecipient } from "./local-smtp.js";
import { withXcrMailSignature } from "../functions/_shared/mail-signature.js";

const resources = fileURLToPath(new URL("../resources/mma/", import.meta.url));
const broker = { broker_name: "EXCELLENCE COVERAGE RISKS / ImmeubleAssur.com", broker_representative: "Tony CERDA", broker_orias: "11 061 425", broker_address: "2 avenue Gallieni", broker_city: "Melun", broker_postcode: "77000", broker_email: "team@immeubleassur.com", broker_phone: "01 80 85 57 80", broker_code: "À compléter" };
const esc = value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const wp = (value, bold = false) => `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${esc(value)}</w:t></w:r></w:p>`;
function rowsForAnswers(answers) {
  const rows = [];
  for (const section of questionnaireSections) {
    rows.push({ heading: section.title });
    for (const field of section.fields) {
      if (field.type === "rows") {
        rows.push({ label: field.label, value: Array.isArray(answers[field.id]) && answers[field.id].length ? "" : "Aucune ligne renseignée / à confirmer" });
        for (const [index, row] of (Array.isArray(answers[field.id]) ? answers[field.id] : []).entries()) for (const column of field.columns) rows.push({ label: `${index + 1}. ${column.label}`, value: displayAnswer(column, row[column.id]) });
      } else rows.push({ label: field.label, value: displayAnswer(field, answers[field.id]) });
    }
  }
  return rows;
}
async function embedFont(pdf) {
  const path = process.env.QUESTIONNAIRE_PDF_FONT || "C:/Windows/Fonts/arial.ttf";
  if (existsSync(path)) { pdf.registerFontkit(fontkit); return pdf.embedFont(readFileSync(path), { subset: true }); }
  return pdf.embedFont(StandardFonts.Helvetica);
}
function safeText(value, font) { const supported = new Set(font.getCharacterSet()); return [...String(value)].map(char => supported.has(char.codePointAt(0)) ? char : "?").join(""); }
async function answerPdf({ answers, reference, confirmed_at }) {
  const pdf = await PDFDocument.create(), font = await embedFont(pdf);
  let page, y, pageNumber = 0;
  function nextPage() { page = pdf.addPage([595.28, 841.89]); pageNumber++; y = 766; page.drawRectangle({ x: 0, y: 789, width: 596, height: 53, color: rgb(0.03, 0.19, 0.28) }); page.drawText("ImmeubleAssur | Dossier " + reference, { x: 38, y: 810, size: 11, font, color: rgb(1, 1, 1) }); page.drawText(`Réponses client - document non signé - ${pageNumber}`, { x: 38, y: 24, size: 8, font, color: rgb(0.3, 0.35, 0.4) }); }
  function lines(text, size) { const words = safeText(text, font).split(/\s+/); const rows = []; let line = ""; for (const word of words) { if (font.widthOfTextAtSize(line + " " + word, size) > 515 && line) { rows.push(line); line = word; } else line += (line ? " " : "") + word; } rows.push(line); return rows; }
  function write(value, size = 10, color = rgb(0.12, 0.17, 0.22)) { for (const line of lines(value, size)) { if (y < 55) nextPage(); page.drawText(line, { x: 39, y, size, font, color }); y -= size + 4; } }
  nextPage(); write("Questionnaire immeuble - annexe exhaustive", 17); y -= 6;
  write(`Transmission au courtier : ${new Date(confirmed_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`);
  write("Les réponses doivent être vérifiées par le courtier. Ce document ne vaut ni signature du questionnaire MMA, ni visite du risque, ni souscription d’une assurance.");
  write(`${unresolvedAnswers(answers).length} rubriques non renseignées ou à confirmer (y compris les rubriques éventuellement sans objet).`); y -= 8;
  for (const row of rowsForAnswers(answers)) { if (row.heading) { if (y < 100) nextPage(); y -= 9; write(row.heading, 13, rgb(0.02, 0.34, 0.39)); y -= 3; } else { write(row.label, 9, rgb(0.25, 0.29, 0.34)); write(row.value || "Détail ci-dessous", 10); y -= 4; } }
  return Buffer.from(await pdf.save());
}
async function reportPdf({ answers, reference }) {
  const pdf = await PDFDocument.load(readFileSync(resources + "rapport-visite-immeuble.pdf")), font = await embedFont(pdf), form = pdf.getForm();
  const values = { Texte1: "XCR / ImmeubleAssur - code MMA à confirmer", Texte3: "Réf. interne : " + reference, Texte4: answers.representative_name || "", Texte5: answers.residence_name || "SDC : dénomination à confirmer", Texte7: [answers.risk_address, answers.risk_postcode, answers.risk_city].filter(Boolean).join(", "), Texte8: answers.declared_surface_basis === "developed" ? String(answers.developed_total || answers.declared_surface || "") : String(answers.developed_total || ""), Texte12: "PRÉPARATION SUR DÉCLARATION CLIENT - AUCUNE VISITE EFFECTUÉE.\nVoir l’annexe de réponses pour les usages, surfaces et points à confirmer.", Texte18: "Usage déclaré : " + displayAnswer({ type: "choice", options: [["habitation", "Habitation / bureaux"], ["mixte", "Mixte"], ["professionnel", "Professionnel"], ["unknown", "À confirmer"]] }, answers.use_type) + ". Voir l’annexe exhaustive pour le détail.", Texte34: `Dossier ${reference}. Réponses transmises par le client et reproduites dans l’annexe exhaustive jointe. Les cases non cochées ne constituent pas des réponses négatives. La superficie développée doit être vérifiée selon la définition du modèle MMA. Aucune visite ni signature n’est attestée.` };
  for (const [name, value] of Object.entries(values)) { const field = form.getTextField(name); field.setText(safeText(value, font)); field.setFontSize(name === "Texte34" ? 10 : 8.5); }
  form.updateFieldAppearances(font);
  return Buffer.from(await pdf.save());
}
async function questionnaireWord({ answers, reference, confirmed_at }) {
  const zip = await JSZip.loadAsync(readFileSync(resources + "questionnaire-immeuble.docx"));
  let xml = await zip.file("word/document.xml").async("string");
  const fields = { ...broker, ...answers };
  xml = xml.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => esc(fields[key] === "" || fields[key] === undefined ? "À compléter" : fields[key]));
  const annex = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` + wp("ANNEXE DE RÉPONSES CLIENT - " + reference, true) + wp(`Reçue le ${new Date(confirmed_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}. Version non signée, à relire par le courtier. Les réponses de l’annexe complètent le modèle vierge ; ses cases non cochées ne valent pas réponse négative.`) + rowsForAnswers(answers).map(row => row.heading ? wp(row.heading, true) : wp(row.label + " : " + (row.value || "Détail ci-dessous"))).join("");
  const section = xml.lastIndexOf("<w:sectPr");
  if (section < 0) throw new Error("Modèle Word invalide");
  xml = xml.slice(0, section) + annex + xml.slice(section);
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
export async function generateMmaQuestionnaire(input) {
  const name = input.reference.replace(/[^a-zA-Z0-9-]/g, "");
  const [report, answers, word] = await Promise.all([reportPdf(input), answerPdf(input), questionnaireWord(input)]);
  return [
    { file_name: `MMA-rapport-visite-${name}-declarations.pdf`, mime_type: "application/pdf", content_base64: report.toString("base64") },
    { file_name: `MMA-reponses-client-${name}.pdf`, mime_type: "application/pdf", content_base64: answers.toString("base64") },
    { file_name: `MMA-questionnaire-${name}-avec-annexe.docx`, mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", content_base64: word.toString("base64") }
  ];
}
export function questionnaireMimeMessage({ from, to, subject, body, files = [] }) {
  const clean = value => String(value).replace(/[\r\n"]/g, " ");
  const boundary = "=_immeuble_q_" + crypto.randomUUID().replace(/-/g, "");
  const encodedSubject = Buffer.from(subject, "utf8").toString("base64");
  return [`From: ${clean(from)}`, `To: ${clean(to)}`, `Subject: =?UTF-8?B?${encodedSubject}?=`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", withXcrMailSignature(body), ...files.flatMap(file => [`--${boundary}`, `Content-Type: ${file.mime_type}; name="${clean(file.file_name)}"`, `Content-Disposition: attachment; filename="${clean(file.file_name)}"`, "Content-Transfer-Encoding: base64", "", file.content_base64.match(/.{1,76}/g)?.join("\r\n") || ""]), `--${boundary}--`, ""].join("\r\n");
}
export async function notifyMmaQuestionnaire({ reference, submission_id, confirmed_at, files }) {
  const config = requireOperationalTeamRecipient({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), username: process.env.SMTP_USER, password: process.env.SMTP_PASS, from: process.env.SMTP_FROM || process.env.SMTP_USER, to: ["team@immeubleassur.com"] });
  const message = questionnaireMimeMessage({ from: config.from, to: "team@immeubleassur.com", subject: `Questionnaire client reçu - ${reference}`, body: `Le prospect a transmis ses réponses le ${confirmed_at}.\n\nDossier : ${reference}\nRéponse : ${submission_id}\n\nLes documents MMA et l’annexe exhaustive sont joints. Un brouillon assureur a été préparé dans le centre dossiers. Vérifier les informations, les pièces et le destinataire avant approbation. Aucune consultation assureur n’a été envoyée.`, files });
  return sendNodeSmtpMail(config, message);
}
