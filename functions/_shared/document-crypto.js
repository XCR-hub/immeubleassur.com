const ENCRYPTION_MARKER = "document-encryption-aes-256-gcm-v1";

function base64ToBytes(value) {
  return Uint8Array.from(atob(String(value || "").replace(/\s/g, "")), (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function keyBytes(env = {}) {
  const raw = String(env.DOCUMENT_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) return Uint8Array.from(raw.match(/.{2}/g).map((pair) => Number.parseInt(pair, 16)));
  try {
    const decoded = base64ToBytes(raw);
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

export function documentEncryptionRequired(env = {}) {
  return String(env.DOCUMENT_ENCRYPTION_REQUIRED || "0") === "1";
}

export function documentEncryptionConfigured(env = {}) {
  return Boolean(keyBytes(env));
}

export async function encryptDocumentBase64(encoded, env = {}) {
  const material = keyBytes(env);
  if (!material) {
    if (documentEncryptionRequired(env)) throw new Error("DOCUMENT_ENCRYPTION_KEY missing or invalid");
    return null;
  }
  const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, base64ToBytes(encoded)));
  return { marker: ENCRYPTION_MARKER, algorithm: "AES-256-GCM", iv_base64: bytesToBase64(iv), ciphertext_base64: bytesToBase64(ciphertext) };
}

export async function decryptDocumentBase64(attachment = {}, env = {}) {
  if (attachment.content_base64) return String(attachment.content_base64);
  if (attachment.storage_marker !== ENCRYPTION_MARKER) return "";
  const material = keyBytes(env);
  if (!material || !attachment.iv_base64 || !attachment.ciphertext_base64) return "";
  try {
    const key = await crypto.subtle.importKey("raw", material, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(attachment.iv_base64) }, key, base64ToBytes(attachment.ciphertext_base64));
    return bytesToBase64(new Uint8Array(plain));
  } catch {
    return "";
  }
}

export const DOCUMENT_ENCRYPTION_MARKER = ENCRYPTION_MARKER;
