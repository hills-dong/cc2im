import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolve, join } from "path";
import { homedir } from "os";

vi.mock("fs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("fs")>();
  return { ...mod, existsSync: vi.fn(() => false) };
});

const { existsSync } = await import("fs");
const { resolveConfigPath } = await import("../src/service.js");

beforeEach(() => vi.clearAllMocks());

describe("resolveConfigPath", () => {
  it("returns empty string input as falsy — falls back to default", () => {
    // Empty string is falsy, so explicit check `if (explicit)` skips it
    (existsSync as any).mockReturnValue(false);
    const result = resolveConfigPath("");
    expect(result).toBe(join(homedir(), ".config", "cc2im", "config.yaml"));
  });

  it("resolves a relative path to absolute when explicit is provided", () => {
    const result = resolveConfigPath("relative/config.yaml");
    expect(result).toBe(resolve("relative/config.yaml"));
  });

  it("falls back to ~/.config/cc2im/config.yaml when no cwd config exists", () => {
    (existsSync as any).mockReturnValue(false);
    const result = resolveConfigPath(undefined);
    expect(result).toBe(join(homedir(), ".config", "cc2im", "config.yaml"));
  });

  it("returns cwd config.yaml when it exists and no explicit given", () => {
    (existsSync as any).mockReturnValue(true);
    const result = resolveConfigPath(undefined);
    expect(result).toBe(resolve("config.yaml"));
  });
});
