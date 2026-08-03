function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function base64(value) {
  if (typeof btoa === "function") return btoa(value);
  return globalThis.Buffer.from(value, "utf8").toString("base64");
}

function smtpSession(socket) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  let buffer = "";

  async function readLine() {
    while (!buffer.includes("\n")) {
      const { value, done } = await reader.read();
      if (done) throw new Error("Connexion SMTP fermee");
      buffer += decoder.decode(value, { stream: true });
    }
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).replace(/\r$/, "");
    buffer = buffer.slice(index + 1);
    return line;
  }

  async function readResponse() {
    const lines = [];
    while (true) {
      const line = await readLine();
      lines.push(line);
      if (/^\d{3} /.test(line)) break;
      if (!/^\d{3}-/.test(line)) break;
    }
    const code = Number.parseInt(lines[lines.length - 1].slice(0, 3), 10);
    if (!Number.isFinite(code)) throw new Error(`Reponse SMTP invalide: ${lines.join(" | ")}`);
    return { code, lines };
  }

  async function writeLine(line) {
    await writer.write(encoder.encode(`${line}\r\n`));
  }

  async function writeRaw(text) {
    await writer.write(encoder.encode(text));
  }

  function release() {
    reader.releaseLock();
    writer.releaseLock();
  }

  return { readResponse, writeLine, writeRaw, release };
}

function assertSmtp(response, expected, context) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) {
    throw new Error(`${context}: SMTP ${response.code} ${response.lines.join(" | ")}`);
  }
}

async function smtpCommand(session, command, expected, context = command) {
  await session.writeLine(command);
  const response = await session.readResponse();
  assertSmtp(response, expected, context);
  return response;
}

async function smtpAuth(session, username, password) {
  await session.writeLine(`AUTH PLAIN ${base64(`\0${username}\0${password}`)}`);
  let response = await session.readResponse();
  if (response.code === 235) return;
  if (response.code !== 504 && response.code !== 503) {
    assertSmtp(response, 235, "AUTH PLAIN");
  }

  await session.writeLine("AUTH LOGIN");
  response = await session.readResponse();
  assertSmtp(response, 334, "AUTH LOGIN");
  await session.writeLine(base64(username));
  response = await session.readResponse();
  assertSmtp(response, 334, "AUTH LOGIN username");
  await session.writeLine(base64(password));
  response = await session.readResponse();
  assertSmtp(response, 235, "AUTH LOGIN password");
}

function dotStuff(message) {
  return message
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function parseRawMail(message) {
  const raw = String(message || "").replace(/\r\n/g, "\n");
  const split = raw.indexOf("\n\n");
  const headerText = split >= 0 ? raw.slice(0, split) : raw;
  const body = split >= 0 ? raw.slice(split + 2) : "";
  const headers = {};
  for (const line of headerText.split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return {
    from: clean(headers.from, 240),
    to: clean(headers.to, 1000).split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 20),
    subject: clean(headers.subject, 500),
    text: body.slice(0, 100000)
  };
}

export async function verifyResendConnection(config) {
  const apiKey = clean(config.apiKey, 300);
  const endpoint = clean(config.apiUrl || "https://api.resend.com/emails", 500).replace(/\/emails\/?$/, "/domains");
  if (!apiKey) throw new Error("Configuration Resend incomplete");
  const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + apiKey }, signal: AbortSignal.timeout(12000) });
  const responseText = await response.text();
  if (!response.ok) throw new Error("Resend HTTP " + response.status + ": " + responseText.slice(0, 240));
  return { status: "ready", provider: "resend", authenticated: true };
}

export async function sendResendMail(config, message) {
  const apiKey = clean(config.apiKey, 300);
  const endpoint = clean(config.apiUrl || "https://api.resend.com/emails", 500);
  if (!apiKey) throw new Error("Configuration Resend incomplete");
  const parsed = parseRawMail(message);
  if (!parsed.from || !parsed.to.length || !parsed.subject) throw new Error("Message email incomplet");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ from: parsed.from, to: parsed.to, subject: parsed.subject, text: parsed.text }),
    signal: AbortSignal.timeout(15000)
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error("Resend HTTP " + response.status + ": " + responseText.slice(0, 240));
  let payload = {};
  try { payload = responseText ? JSON.parse(responseText) : {}; } catch {}
  return "resend:" + clean(payload.id || "accepted", 160);
}

async function sendRuntimeSmtpMail() {
  throw new Error("Adaptateur SMTP local indisponible");
}

export async function sendPortableSmtpMail(config, message, env = {}) {
  const resendKey = clean(env.RESEND_API_KEY, 300);
  if (resendKey && clean(env.EMAIL_TRANSPORT || "resend", 40) === "resend") {
    return sendResendMail({ ...config, apiKey: resendKey, apiUrl: env.RESEND_API_URL }, message);
  }
  if (typeof env.SEND_SMTP_MAIL === "function") {
    return env.SEND_SMTP_MAIL(config, message);
  }
  if (typeof globalThis.__IMMEUBLEASSUR_SEND_SMTP_MAIL === "function") {
    return globalThis.__IMMEUBLEASSUR_SEND_SMTP_MAIL(config, message);
  }
  return sendRuntimeSmtpMail(config, message);
}
