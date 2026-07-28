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

async function sendCloudflareSmtpMail(config, message) {
  const { connect } = await import("cloudflare:sockets");
  let socket = connect(
    { hostname: config.host, port: config.port },
    { secureTransport: config.secureTransport }
  );
  await socket.opened;
  let session = smtpSession(socket);

  let response = await session.readResponse();
  assertSmtp(response, 220, "Accueil SMTP");
  await smtpCommand(session, "EHLO immeubleassur.com", 250, "EHLO");

  if (config.secureTransport === "starttls") {
    await smtpCommand(session, "STARTTLS", 220, "STARTTLS");
    session.release();
    socket = socket.startTls();
    await socket.opened;
    session = smtpSession(socket);
    await smtpCommand(session, "EHLO immeubleassur.com", 250, "EHLO TLS");
  }

  await smtpAuth(session, config.username, config.password);
  await smtpCommand(session, `MAIL FROM:<${clean(config.from, 180)}>`, 250, "MAIL FROM");
  for (const recipient of config.to || []) {
    await smtpCommand(session, `RCPT TO:<${clean(recipient, 180)}>`, [250, 251], "RCPT TO");
  }
  await smtpCommand(session, "DATA", 354, "DATA");
  await session.writeRaw(`${dotStuff(message)}\r\n.\r\n`);
  response = await session.readResponse();
  assertSmtp(response, 250, "Fin DATA");
  await session.writeLine("QUIT");
  socket.close().catch(() => {});
  return response.lines.join(" | ");
}

export async function sendPortableSmtpMail(config, message, env = {}) {
  if (typeof env.SEND_SMTP_MAIL === "function") {
    return env.SEND_SMTP_MAIL(config, message);
  }
  if (typeof globalThis.__IMMEUBLEASSUR_SEND_SMTP_MAIL === "function") {
    return globalThis.__IMMEUBLEASSUR_SEND_SMTP_MAIL(config, message);
  }
  return sendCloudflareSmtpMail(config, message);
}
