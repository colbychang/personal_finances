import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encrypt, decrypt } from "@/lib/encryption";

// Set up a test encryption key
const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

beforeAll(() => {
  process.env.PLAID_TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

afterAll(() => {
  delete process.env.PLAID_TOKEN_ENCRYPTION_KEY;
});

describe("encryption", () => {
  it("encrypts and decrypts a string round-trip", () => {
    const plaintext = "access-sandbox-12345678-abcd-efgh-ijkl-mnopqrstuvwx";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertexts for same input (random IV)", () => {
    const plaintext = "test-token-value";
    const encrypted1 = encrypt(plaintext);
    const encrypted2 = encrypt(plaintext);
    expect(encrypted1).not.toBe(encrypted2);
    // But both decrypt to same value
    expect(decrypt(encrypted1)).toBe(plaintext);
    expect(decrypt(encrypted2)).toBe(plaintext);
  });

  it("encrypted format is iv:authTag:ciphertext (3 hex parts)", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    // IV is 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty
    expect(parts[2]!.length).toBeGreaterThan(0);
  });

  it("throws on invalid encrypted format", () => {
    expect(() => decrypt("invalid")).toThrow("Invalid encrypted text format");
  });

  it("handles empty string", () => {
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });
});
