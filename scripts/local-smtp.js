import net from "node:net";
import tls from "node:tls";

function base64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function dotStuff(message) {
  return String(message || "")
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function createLineClient(socket) {
  let buffer = "";
  const waiters = [];
  let closed = false;
  let failure = null;

  function pump() {
    while (waiters.length && buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      waiters.shift().resolve(line);
    }
    if ((closed || failure) && waiters.length) {
      const error = failure || new Error("Connexion SMTP fermee");
      while (waiters.length) waiters.shift().reject(error);
    }
  }

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    pump();
  });
  socket.on("error", (error) => {
    failure = error;
    pump();
  });
  socket.on("close", () => {
    closed = true;
    pump();
  });

  function readLine() {
    if (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      return Promise.resolve(line);
    }
    if (failure) return Promise.reject(failure);
    if (closed) return Promise.reject(new Error("Connexion SMTP fermee"));
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  }

  function writeLine(line) {
    return new Promise((resolve, reject) => {
      socket.write(`${line}\r\n`, "utf8", (error) => (error ? reject(error) : resolve()));
    });
  }

  function writeRaw(text) {
    return new Promise((resolve, reject) => {
      socket.write(text, "utf8", (error) => (error ? reject(error) : resolve()));
    });
  }

  return { readLine, writeLine, writeRaw };
}

async function readResponse(client) {
  const lines = [];
  while (true) {
    const line = await client.readLine();
    lines.push(line);
    if (/^\d{3} /.test(line)) break;
    if (!/^\d{3}-/.test(line)) break;
  }
  const code = Number.parseInt(lines[lines.length - 1].slice(0, 3), 10);
  if (!Number.isFinite(code)) throw new Error(`Reponse SMTP invalide: ${lines.join(" | ")}`);
  return { code, lines };
}

function assertSmtp(response, expected, context) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) throw new Error(`${context}: SMTP ${response.code} ${response.lines.join(" | ")}`);
}

async function smtpCommand(client, command, expected, context = command) {
  await client.writeLine(command);
  const response = await readResponse(client);
  assertSmtp(response, expected, context);
  return response;
}

async function smtpAuth(client, username, password) {
  await client.writeLine(`AUTH PLAIN ${base64(`\0${username}\0${password}`)}`);
  let response = await readResponse(client);
  if (response.code === 235) return;
  if (response.code !== 504 && response.code !== 503) assertSmtp(response, 235, "AUTH PLAIN");

  await client.writeLine("AUTH LOGIN");
  response = await readResponse(client);
  assertSmtp(response, 334, "AUTH LOGIN");
  await client.writeLine(base64(username));
  response = await readResponse(client);
  assertSmtp(response, 334, "AUTH LOGIN username");
  await client.writeLine(base64(password));
  response = await readResponse(client);
  assertSmtp(response, 235, "AUTH LOGIN password");
}

function tlsOptions(host, config = {}) {
  return {
    host,
    servername: host,
    // SMTP must validate the server certificate by default.
    rejectUnauthorized: config.rejectUnauthorized !== false
  };
}

function connectTcp({ host, port, secure, rejectUnauthorized }) {
  return new Promise((resolve, reject) => {
    const socket = secure
      ? tls.connect({ ...tlsOptions(host, { rejectUnauthorized }), port }, () => resolve(socket))
      : net.connect({ host, port }, () => resolve(socket));
    socket.setTimeout(20000, () => socket.destroy(new Error("Timeout SMTP")));
    socket.once("error", reject);
  });
}

function startTls(socket, host, rejectUnauthorized) {
  return new Promise((resolve, reject) => {
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
    socket.removeAllListeners("close");
    const secureSocket = tls.connect({ socket, ...tlsOptions(host, { rejectUnauthorized }) }, () => resolve(secureSocket));
    secureSocket.setTimeout(20000, () => secureSocket.destroy(new Error("Timeout SMTP TLS")));
    secureSocket.once("error", reject);
  });
}

export async function sendNodeSmtpMail(config, message) {
  const host = String(config.host || "").trim();
  const port = Number.parseInt(config.port || "587", 10);
  const username = String(config.username || "").trim();
  const password = String(config.password || "");
  const from = String(config.from || username).trim();
  const to = Array.isArray(config.to) ? config.to.filter(Boolean) : [];
  if (!host || !port || !username || !password || !from || to.length === 0) {
    throw new Error("Configuration SMTP locale incomplete");
  }

  let socket = await connectTcp({ host, port, secure: config.secureTransport === "on", rejectUnauthorized: config.rejectUnauthorized });
  let client = createLineClient(socket);
  let response = await readResponse(client);
  assertSmtp(response, 220, "Accueil SMTP");
  await smtpCommand(client, "EHLO immeubleassur.com", 250, "EHLO");

  if (config.secureTransport === "starttls") {
    await smtpCommand(client, "STARTTLS", 220, "STARTTLS");
    socket = await startTls(socket, host, config.rejectUnauthorized);
    client = createLineClient(socket);
    await smtpCommand(client, "EHLO immeubleassur.com", 250, "EHLO TLS");
  }

  await smtpAuth(client, username, password);
  await smtpCommand(client, `MAIL FROM:<${from}>`, 250, "MAIL FROM");
  for (const recipient of to) await smtpCommand(client, `RCPT TO:<${recipient}>`, [250, 251], "RCPT TO");
  await smtpCommand(client, "DATA", 354, "DATA");
  await client.writeRaw(`${dotStuff(message)}\r\n.\r\n`);
  response = await readResponse(client);
  assertSmtp(response, 250, "Fin DATA");
  await client.writeLine("QUIT").catch(() => {});
  socket.end();
  return response.lines.join(" | ");
}
