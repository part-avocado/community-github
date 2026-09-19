// AES-256-GCM encryption for donated GitHub tokens at rest, plus the smaller
// hashing/signing/random-string helpers used across OAuth, CSRF, and API keys.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function randomBase32(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += alphabet[(value << (5 - bits)) & 31];
  }
  return out;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bufferToHex(digest);
}

export async function sha256HexBytes(input: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", input as ArrayBuffer);
  return bufferToHex(digest);
}

export function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importAesKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToBytes(base64Key);
  if (raw.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 raw bytes (base64-encoded)");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export interface Encrypted {
  ciphertext: ArrayBuffer;
  iv: ArrayBuffer;
}

export async function encryptSecret(plaintext: string, base64Key: string): Promise<Encrypted> {
  const key = await importAesKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext, iv: iv.buffer };
}

export async function decryptSecret(
  ciphertext: ArrayBuffer,
  iv: ArrayBuffer,
  base64Key: string,
): Promise<string> {
  const key = await importAesKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

async function importHmacKey(base64Key: string): Promise<CryptoKey> {
  const raw = base64ToBytes(base64Key);
  return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Signs an arbitrary JSON-serializable payload into a compact `<payload>.<sig>` token. */
export async function signSession(payload: unknown, base64Key: string): Promise<string> {
  const key = await importHmacKey(base64Key);
  const payloadB64 = bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${bytesToBase64(new Uint8Array(sig))}`;
}

/** Verifies and decodes a token produced by signSession. Returns null if invalid/tampered. */
export async function verifySession<T>(token: string, base64Key: string): Promise<T | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  try {
    const key = await importHmacKey(base64Key);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64ToBytes(sigB64),
      new TextEncoder().encode(payloadB64),
    );
    if (!ok) return null;
    const json = new TextDecoder().decode(base64ToBytes(payloadB64));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) {
    // Still compare something of matching length to avoid an early-exit timing
    // signal on length itself; the result is discarded.
    let dummy = 0;
    for (let i = 0; i < aBytes.length; i++) dummy |= aBytes[i]! ^ (bBytes[i % bBytes.length] ?? 0);
    void dummy;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i]! ^ bBytes[i]!;
  return diff === 0;
}

/** Generates a consumer/donor-facing API key in the `hc_app_machine_<random>` shape. */
export function generateApiKey(hcUsername: string, appName: string, machine: string): string {
  const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const suffix = randomString(24);
  return `${slug(hcUsername)}_${slug(appName)}_${slug(machine)}_${suffix}`;
}

export function keyHint(key: string): string {
  const i = key.lastIndexOf("_");
  const rand = i >= 0 ? key.slice(i + 1) : key;
  return rand.slice(0, 6);
}

export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 6) return "***";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}
