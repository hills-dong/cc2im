import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../src/auth.js";

describe("auth edge cases", () => {
  const secret = "test-secret-for-edge-cases";

  // --- hashPassword ---

  it("hashPassword('') does not throw and returns valid salt:hash format", async () => {
    const hash = await hashPassword("");
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("hashPassword produces different hashes for same input (random salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
    // But both should verify
    expect(await verifyPassword("same", h1)).toBe(true);
    expect(await verifyPassword("same", h2)).toBe(true);
  });

  // --- verifyPassword ---

  it("verifyPassword with no colon separator returns false", async () => {
    expect(await verifyPassword("pw", "invalidhash")).toBe(false);
  });

  it("verifyPassword with empty stored string returns false", async () => {
    expect(await verifyPassword("pw", "")).toBe(false);
  });

  it("verifyPassword with multiple colons (salt:hash:extra) returns false", async () => {
    // split(":") gives ["salt", "hash", "extra"], destructuring takes first two.
    // "hash" is only 4 hex chars (2 bytes) but derived is 128 hex chars (64 bytes).
    // Buffer length check prevents RangeError from timingSafeEqual.
    expect(await verifyPassword("pw", "salt:hash:extra")).toBe(false);
  });

  // --- signToken ---

  it("signToken header contains HS256 algorithm", () => {
    const token = signToken(secret, 3600);
    const [headerB64] = token.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString());
    expect(header.alg).toBe("HS256");
    expect(header.typ).toBe("JWT");
  });

  it("signToken payload has correct iat and exp", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signToken(secret, 3600);
    const after = Math.floor(Date.now() / 1000);

    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(payload.exp).toBeGreaterThanOrEqual(before + 3600);
    expect(payload.exp).toBeLessThanOrEqual(after + 3600);
  });

  it("signToken with expiresInSec=0 creates token expiring ~now", () => {
    const token = signToken(secret, 0);
    const [, payloadB64] = token.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    // exp should be approximately equal to iat
    expect(Math.abs(payload.exp - payload.iat)).toBeLessThanOrEqual(1);
  });

  it("signToken with negative expiry produces expired token", () => {
    const token = signToken(secret, -100);
    expect(verifyToken(token, secret)).toBe(false);
  });

  // --- verifyToken ---

  it("verifyToken with 4 parts (a.b.c.d) returns false", () => {
    expect(verifyToken("a.b.c.d", secret)).toBe(false);
  });

  it("verifyToken with 2 parts (a.b) returns false", () => {
    expect(verifyToken("a.b", secret)).toBe(false);
  });

  it("verifyToken with empty string returns false", () => {
    expect(verifyToken("", secret)).toBe(false);
  });

  it("verifyToken with invalid base64 payload returns false", () => {
    // Valid header, garbage payload, garbage signature
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    expect(verifyToken(`${header}.!!!invalid!!!.sig`, secret)).toBe(false);
  });

  it("verifyToken with payload missing exp field returns false", () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iat: Math.floor(Date.now() / 1000) })).toString("base64url");
    // Create a valid HMAC signature for this header.payload
    const { createHmac } = require("crypto");
    const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
    expect(verifyToken(`${header}.${payload}.${signature}`, secret)).toBe(false);
  });

  it("verifyToken with wrong secret returns false", () => {
    const token = signToken(secret, 3600);
    expect(verifyToken(token, "wrong-secret")).toBe(false);
  });
});
