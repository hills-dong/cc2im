import { describe, it, expect, afterEach } from "vitest";

const originalPlatform = process.platform;

afterEach(() => {
  Object.defineProperty(process, "platform", { value: originalPlatform });
});

describe("detectPlatform", () => {
  it("returns launchd on darwin", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // Re-import to get fresh module? No — detectPlatform reads process.platform at call time
    const { detectPlatform } = await import("../src/service.js");
    expect(detectPlatform()).toBe("launchd");
  });

  it("returns systemd on linux", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const { detectPlatform } = await import("../src/service.js");
    expect(detectPlatform()).toBe("systemd");
  });

  it("returns systemd on win32", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const { detectPlatform } = await import("../src/service.js");
    expect(detectPlatform()).toBe("systemd");
  });
});
