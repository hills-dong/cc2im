import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../src/auth.js";

describe("auth", () => {
  const secret = "test-secret-key-for-jwt";

  it("hashes and verifies password", async () => {
    const hash = await hashPassword("mypassword");
    expect(await verifyPassword("mypassword", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("signs and verifies JWT token", () => {
    const token = signToken(secret, 3600);
    const valid = verifyToken(token, secret);
    expect(valid).toBe(true);
  });

  it("rejects expired token", () => {
    const token = signToken(secret, -1);
    const valid = verifyToken(token, secret);
    expect(valid).toBe(false);
  });

  it("rejects tampered token", () => {
    const token = signToken(secret, 3600) + "x";
    const valid = verifyToken(token, secret);
    expect(valid).toBe(false);
  });
});
