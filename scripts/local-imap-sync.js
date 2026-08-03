import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { loadDefaultEnvFiles, env } from "./local-env.js";
import { openLocalSqlite } from "./local-sqlite-db.js";

loadDefaultEnvFiles();

const reportPath = resolve(env("LOCAL_IMAP_REPORT", join("reports", "local-imap-sync-report.json")));
const db = openLocalSqlite({ dbPath: env("LOCAL_SQLITE_DB", join("data", "immeubleassur.sqlite")), schemaPath: "schema.sql" });
const mailbox = String(env("IMAP_MAILBOX", "INBOX")).replace(/[\r\n]/g, "").slice(0, 80) || "INBOX";
const host = String(env("IMAP_HOST", "")).trim();
const port = Number.parseInt(env("IMAP_PORT", "993"), 10) || 993;
const username = String(env("IMAP_USER", "")).trim();
const password = String(env("IMAP_PASS", ""));
const lookbackDays = Math.max(1, Math.min(30, Number.parseInt(env("IMAP_LOOKBACK_DAYS", "7"), 10) || 7));
const maxMessages = Math.max(1, Math.min(100, Number.parseInt(env("IMAP_MAX_MESSAGES", "40"), 10) || 40));

function nowIso() { return new Date().toISOString(); }
function clean(value, max = 500) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max); }
function json(value) { return JSON.stringify(value); }
function writeReport(report) { mkdirSync(resolve(reportPath, ".."), { recursive: true }); writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"); }
function quoted(value) { return `"${String(value || "").replace(/[\\"]/g, "\\$&").replace(/[\r\n]/g, " ")}"`; }
function imapDate(date) { return `${String(date.getUTCDate()).padStart(2, "0")}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getUTCMonth()]}-${date.getUTCFullYear()}`; }
function decodeHeader(value) {
  return String(value || "").replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_all, charset, encoding, data) => {
    try {
      if (encoding.toLowerCase() === "b") return Buffer.from(data, "base64").toString("utf8");
      return Buffer.from(data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16))), "binary").toString("utf8");
    } catch { return data; }
  });
}
function parseHeaders(literal) {
  const unfolded = String(literal || "").replace(/\r?\n[ \t]+/g, " ");
  const result = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) result[match[1].toLowerCase()] = clean(decodeHeader(match[2]), 1000);
  }
  return result;
}
function extractLiterals(buffer) {
  const text = buffer.toString("utf8");
  const literals = [];
  for (const match of text.matchAll(/\{(\d+)\}\r?\n/g)) {
    const length = Number.parseInt(match[1], 10);
    const start = match.index + match[0].length;
    if (Number.isFinite(length) && start + length <= buffer.length) literals.push(buffer.subarray(start, start + length).toString("utf8"));
  }
  return literals;
}
function caseReference(subject) {
  return (String(subject || "").match(/\bDOS-[A-Z0-9-]{4,}\b/i)?.[0] || "").toUpperCase();
}

class ImapSession {
  constructor() { this.socket = null; this.buffer = Buffer.alloc(0); this.tag = 0; }
  async connect() {
    this.socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true });
    await new Promise((resolveConnect, reject) => { this.socket.once("secureConnect", resolveConnect); this.socket.once("error", reject); });
    await this.readGreeting();
  }
  readGreeting() {
    return new Promise((resolveRead, reject) => {
      const onData = (chunk) => { this.buffer = Buffer.concat([this.buffer, chunk]); if (this.buffer.includes(Buffer.from("\r\n"))) { cleanup(); resolveRead(); } };
      const onError = (error) => { cleanup(); reject(error); };
      const cleanup = () => { this.socket.off("data", onData); this.socket.off("error", onError); };
      this.socket.on("data", onData); this.socket.once("error", onError);
    });
  }
  readUntilTag(tag) {
    return new Promise((resolveRead, reject) => {
      const marker = Buffer.from(`\r\n${tag} `);
      const onData = (chunk) => { this.buffer = Buffer.concat([this.buffer, chunk]); if (this.buffer.includes(marker) || this.buffer.toString("utf8").startsWith(`${tag} `)) { cleanup(); const value = this.buffer; this.buffer = Buffer.alloc(0); resolveRead(value); } };
      const onError = (error) => { cleanup(); reject(error); };
      const cleanup = () => { this.socket.off("data", onData); this.socket.off("error", onError); };
      this.socket.on("data", onData); this.socket.once("error", onError);
    });
  }
  async command(command) {
    const tag = `IA${String(++this.tag).padStart(4, "0")}`;
    this.socket.write(`${tag} ${command}\r\n`);
    const response = await this.readUntilTag(tag);
    if (!new RegExp(`(?:^|\\r\\n)${tag} OK(?:\\s|\\r|\\n)`, "i").test(response.toString("utf8"))) throw new Error(`IMAP commande refusee: ${command.split(" ")[0]}`);
    return response;
  }
  close() { try { this.socket?.end("IA9999 LOGOUT\r\n"); } catch {} }
}

async function sync() {
  const report = { generated_at: nowIso(), status: "skipped", mailbox, mode: "read-only-headers", scanned: 0, imported: 0, matched: 0, unmatched: 0, errors: [] };
  if (!host || !username || !password) { report.reason = "imap_configuration_missing"; writeReport(report); console.log(`IMAP sync skipped: ${report.reason}`); return; }
  const session = new ImapSession();
  try {
    await session.connect();
    await session.command(`LOGIN ${quoted(username)} ${quoted(password)}`);
    await session.command(`SELECT ${quoted(mailbox)}`);
    const since = new Date(Date.now() - lookbackDays * 86400000);
    const search = await session.command(`UID SEARCH SINCE ${imapDate(since)}`);
    const uids = [...search.toString("utf8").matchAll(/\* SEARCH ([^\r\n]*)/gi)].flatMap((match) => match[1].trim().split(/\s+/).filter(Boolean)).slice(-maxMessages);
    for (const uid of uids) {
      report.scanned += 1;
      const messageUid = `${mailbox}:${uid}`;
      const existing = db.prepare("SELECT id FROM case_mail_inbox WHERE mailbox = ? AND message_uid = ?").bind(mailbox, messageUid).first();
      if (existing?.id) continue;
      const response = await session.command(`UID FETCH ${uid} (BODY.PEEK[HEADER.FIELDS (DATE FROM TO SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES)])`);
      const headers = parseHeaders(extractLiterals(response)[0] || "");
      const subject = clean(headers.subject, 500);
      const reference = caseReference(subject);
      const caseRow = reference ? db.prepare("SELECT id FROM brokerage_cases WHERE case_reference = ?").bind(reference).first() : null;
      const id = crypto.randomUUID();
      const messageId = clean(headers["message-id"], 500) || "";
      db.prepare(`INSERT INTO case_mail_inbox (id, case_id, mailbox, message_uid, message_id, sender, recipients, subject, sent_at, matched_reference, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received_pending_review', ?, ?, ?)`).bind(id, caseRow?.id || null, mailbox, messageUid, messageId || null, clean(headers.from, 500), clean(headers.to, 500), subject, clean(headers.date, 200), reference, json({ marker: "local-imap-inbox-v1", read_only_headers: true, in_reply_to: clean(headers["in-reply-to"], 500), references: clean(headers.references, 1000) }), nowIso(), nowIso()).run();
      if (caseRow?.id) {
        db.prepare("INSERT INTO case_timeline (id, case_id, event_type, actor, payload, created_at) VALUES (?, ?, 'mail_received', 'imap', ?, ?)").bind(crypto.randomUUID(), caseRow.id, json({ marker: "local-imap-inbox-v1", inbox_id: id, sender: clean(headers.from, 500), subject, message_id: messageId, human_review_required: true }), nowIso()).run();
        db.prepare("UPDATE brokerage_cases SET human_review_required = 1, next_action = ?, updated_at = ? WHERE id = ?").bind("Relire la reponse email recue et la rattacher au dossier avant toute action.", nowIso(), caseRow.id).run();
        report.matched += 1;
      } else report.unmatched += 1;
      report.imported += 1;
    }
    await session.command("LOGOUT");
    report.status = "completed";
  } catch (error) { report.status = "degraded"; report.errors.push(clean(error.message, 500)); }
  finally { session.close(); writeReport(report); }
  console.log(`IMAP sync ${report.status}: ${report.imported} importe(s), ${report.matched} rattache(s), ${report.unmatched} sans dossier.`);
}

sync().catch((error) => { writeReport({ generated_at: nowIso(), status: "failed", mode: "read-only-headers", errors: [clean(error.message, 500)] }); console.error(error); process.exit(1); });