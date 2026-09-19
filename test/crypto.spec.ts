import { describe, it, expect } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  signSession,
  verifySession,
  sha256Hex,
  generateApiKey,
  keyHint,
  timingSafeEqual,
} from "../src/lib/crypto";

const KEY = "d7rdkK8hM0teSoGFK2ITVGB/5y8rlp32bwtSFAAcnGo=";

describe("token encryption", () => {
  it("round-trips a secret", async () => {
    const { ciphertext, iv } = await encryptSecret("ghp_supersecrettoken", KEY);
    const plaintext = await decryptSecret(ciphertext, iv, KEY);
    expect(plaintext).toBe("ghp_supersecrettoken");
  });

  it("produces different ciphertext each time (random IV)", async () => {
    const a = await encryptSecret("same-input", KEY);
    const b = await encryptSecret("same-input", KEY);
    expect(new Uint8Array(a.ciphertext)).not.toEqual(new Uint8Array(b.ciphertext));
  });
});

describe("session signing", () => {
  it("round-trips a payload", async () => {
    const token = await signSession({ hcIdentityId: "abc", exp: 123 }, KEY);
    const payload = await verifySession<{ hcIdentityId: string; exp: number }>(token, KEY);
    expect(payload).toEqual({ hcIdentityId: "abc", exp: 123 });
  });

  it("rejects a tampered token", async () => {
    const token = await signSession({ hcIdentityId: "abc", exp: 123 }, KEY);
    const tampered = token.slice(0, -2) + "xx";
    const payload = await verifySession(tampered, KEY);
    expect(payload).toBeNull();
  });

  it("rejects a token signed with a different key", async () => {
    const otherKey = "LbxJNX/rE7LhEG2ApxZgElf/a+h970yskdPeTBNzdyA=";
    const token = await signSession({ hcIdentityId: "abc", exp: 123 }, KEY);
    const payload = await verifySession(token, otherKey);
    expect(payload).toBeNull();
  });
});

describe("api key generation", () => {
  it("produces a stable hash for the same key", async () => {
    const key = generateApiKey("zrl", "dev", "shinx");
    expect(await sha256Hex(key)).toBe(await sha256Hex(key));
  });

  it("slugifies the owner/app/machine and appends a random suffix", () => {
    const key = generateApiKey("Z R L!", "My App", "Shinx 2");
    expect(key).toMatch(/^z-r-l_my-app_shinx-2_[a-z0-9]{24}$/);
  });

  it("hint is the first 6 chars of the random suffix", () => {
    const key = "zrl_dev_shinx_abcdefghijklmnopqrstuvwx";
    expect(keyHint(key)).toBe("abcdef");
  });
});

describe("timingSafeEqual", () => {
  it("matches equal strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });
  it("rejects different strings", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });
  it("rejects different-length strings", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
