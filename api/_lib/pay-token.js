// Server side of pay/assets/pay-crypto.js: the same AES-GCM token, so /pay decrypts links
// made here exactly like the ones the browser used to make. Keep the two in step.
import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";

const LINK_KEY_SALT = "proalgo-pay-link-v1";
const LINK_KEY_ITERATIONS = 100000;
const IV_BYTES = 12;
const TAG_BYTES = 16;

const keys = new Map();
function linkKey(secret) {
  if (!secret) throw new Error("Missing link secret");
  if (!keys.has(secret)) keys.set(secret, pbkdf2Sync(secret, LINK_KEY_SALT, LINK_KEY_ITERATIONS, 32, "sha256"));
  return keys.get(secret);
}

// WebCrypto's AES-GCM output is ciphertext followed by the 16-byte tag; the token is iv + that.
export function encodeToken(payload, secret) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", linkKey(secret), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64url");
}

export function decodeToken(token, secret) {
  const bytes = Buffer.from(String(token), "base64url");
  if (bytes.length <= IV_BYTES + TAG_BYTES) throw new Error("Malformed token");
  const decipher = createDecipheriv("aes-256-gcm", linkKey(secret), bytes.subarray(0, IV_BYTES));
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
  const plain = Buffer.concat([decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}
