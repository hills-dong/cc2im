import { describe, test, expect } from "vitest";
import { formatUserError, stripStatusIcon } from "../src/index.js";

describe("formatUserError", () => {
  // --- ENOENT ---
  test("returns install message for ENOENT error code", () => {
    const err = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    const result = formatUserError(err);
    expect(result).toContain("not installed");
    expect(result).toContain("https://docs.anthropic.com");
  });

  test("returns install message when message contains ENOENT (no code property)", () => {
    const err = new Error("Something ENOENT happened");
    const result = formatUserError(err);
    expect(result).toContain("not installed");
  });

  // --- EACCES ---
  test("returns permission message for EACCES error code", () => {
    const err = Object.assign(new Error("spawn claude EACCES"), { code: "EACCES" });
    const result = formatUserError(err);
    expect(result).toContain("Permission denied");
  });

  test("returns permission message when message contains EACCES (no code property)", () => {
    const err = new Error("EACCES: permission denied, open '/usr/bin/claude'");
    const result = formatUserError(err);
    expect(result).toContain("Permission denied");
  });

  // --- Auth / login errors ---
  test.each([
    "auth failed",
    "Login required",
    "please log in first",
    "Invalid API key",
    "unauthorized access",
    "not logged in",
    "account suspended",
  ])("returns login message for auth-related error: %s", (message) => {
    const result = formatUserError(new Error(message));
    expect(result).toContain("not logged in");
    expect(result).toContain("claude login");
  });

  // --- Timeout ---
  test("returns timeout message when error contains 'timed out'", () => {
    const result = formatUserError(new Error("Process timed out after 60s"));
    expect(result).toContain("timed out");
    expect(result).toContain("simpler request");
  });

  // --- Generic errors ---
  test("returns generic message with error text for unknown errors", () => {
    const result = formatUserError(new Error("Something unexpected"));
    expect(result).toBe("❌ Error: Something unexpected");
  });

  test("handles non-Error values (string)", () => {
    const result = formatUserError("raw string error");
    expect(result).toBe("❌ Error: raw string error");
  });

  test("handles non-Error values (number)", () => {
    const result = formatUserError(42);
    expect(result).toBe("❌ Error: 42");
  });

  test("handles null", () => {
    const result = formatUserError(null);
    expect(result).toBe("❌ Error: null");
  });

  test("handles undefined", () => {
    const result = formatUserError(undefined);
    expect(result).toBe("❌ Error: undefined");
  });

  // --- Priority: ENOENT takes precedence over auth keywords ---
  test("ENOENT code takes priority even if message contains auth keywords", () => {
    const err = Object.assign(new Error("auth ENOENT"), { code: "ENOENT" });
    const result = formatUserError(err);
    expect(result).toContain("not installed");
  });

  // --- All results start with error emoji ---
  test("all error messages start with ❌", () => {
    const cases = [
      Object.assign(new Error("x"), { code: "ENOENT" }),
      Object.assign(new Error("x"), { code: "EACCES" }),
      new Error("auth failed"),
      new Error("timed out"),
      new Error("generic"),
    ];
    for (const err of cases) {
      expect(formatUserError(err)).toMatch(/^❌/);
    }
  });
});

describe("stripStatusIcon", () => {
  test("removes 🔄 prefix", () => {
    expect(stripStatusIcon("🔄 Some thread title")).toBe("Some thread title");
  });

  test("removes ✅ prefix", () => {
    expect(stripStatusIcon("✅ Completed task")).toBe("Completed task");
  });

  test("removes prefix with extra whitespace", () => {
    expect(stripStatusIcon("🔄  Double space")).toBe("Double space");
  });

  test("removes prefix with no space", () => {
    expect(stripStatusIcon("✅NoSpace")).toBe("NoSpace");
  });

  test("returns unchanged string with no icon prefix", () => {
    expect(stripStatusIcon("Regular title")).toBe("Regular title");
  });

  test("returns empty string unchanged", () => {
    expect(stripStatusIcon("")).toBe("");
  });

  test("only removes icon at the start, not in the middle", () => {
    expect(stripStatusIcon("Title with 🔄 inside")).toBe("Title with 🔄 inside");
  });

  test("only removes the first icon if multiple are present", () => {
    const result = stripStatusIcon("🔄 ✅ Both icons");
    expect(result).toBe("✅ Both icons");
  });
});
