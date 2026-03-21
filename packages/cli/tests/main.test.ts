import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @cc2im/core
const mockStore = {
  getPendingRestarts: vi.fn(() => []),
  clearPendingRestarts: vi.fn(),
  close: vi.fn(),
  markPendingRestart: vi.fn(),
};
const mockSessionManager = {
  activeKeys: vi.fn(() => []),
  abortAll: vi.fn(),
  updateConfig: vi.fn(),
};
const mockAdapter = {
  platform: "discord",
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  setupProject: vi.fn(async () => ({ channelId: "ch1" })),
  onMessage: vi.fn(),
  onReaction: vi.fn(),
  onSlashCommand: vi.fn(),
};
const mockRouter = {
  registerChannel: vi.fn(),
};
const mockFormatter = {
  updateConfig: vi.fn(),
};

vi.mock("@cc2im/core", () => ({
  loadConfig: vi.fn(() => ({
    discord: { token: "" }, // No token — no adapter
    claude: {},
    formatter: {},
    projects: [],
  })),
  saveConfig: vi.fn(),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  Store: vi.fn(() => mockStore),
  SessionManager: vi.fn(() => mockSessionManager),
  Router: vi.fn(() => mockRouter),
  Formatter: vi.fn(() => mockFormatter),
  THREAD_STATUS_ICONS: { active: "🔄", done: "✅" },
}));

// Mock the local DiscordAdapter (moved from @cc2im/core)
vi.mock("../src/adapters/discord.js", () => ({
  DiscordAdapter: vi.fn(() => mockAdapter),
}));

// Mock child_process (used by generateThreadTitle)
vi.mock("child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("child_process")>();
  return { ...mod, execFile: vi.fn() };
});

const { loadConfig } = await import("@cc2im/core");

beforeEach(() => vi.clearAllMocks());

// Capture process event handlers
const processOnSpy = vi.spyOn(process, "on");
const processExitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as any);

describe("main()", () => {
  it("exits with error when no adapters are configured", async () => {
    const { main } = await import("../src/index.js");
    await main();

    // Adapter start should not have been called since token is empty
    expect(mockAdapter.start).not.toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("creates discord adapter when token is set", async () => {
    (loadConfig as any).mockReturnValue({
      discord: { token: "test-token" },
      claude: {},
      formatter: {},
      projects: [],
    });

    // Need fresh import to pick up new mock return
    vi.resetModules();
    // Re-setup mocks after resetModules
    vi.doMock("@cc2im/core", () => ({
      loadConfig: vi.fn(() => ({
        discord: { token: "test-token" },
        claude: {},
        formatter: {},
        projects: [],
      })),
      saveConfig: vi.fn(),
      addProject: vi.fn(),
      removeProject: vi.fn(),
      Store: vi.fn(() => mockStore),
      SessionManager: vi.fn(() => mockSessionManager),
      Router: vi.fn(() => mockRouter),
      Formatter: vi.fn(() => mockFormatter),
      THREAD_STATUS_ICONS: { active: "🔄", done: "✅" },
    }));
    vi.doMock("../src/adapters/discord.js", () => ({
      DiscordAdapter: vi.fn(() => mockAdapter),
    }));
    vi.doMock("child_process", async (importOriginal) => {
      const mod = await importOriginal<typeof import("child_process")>();
      return { ...mod, execFile: vi.fn() };
    });

    const { main } = await import("../src/index.js");
    await main();

    expect(mockAdapter.start).toHaveBeenCalled();
    expect(mockAdapter.onMessage).toHaveBeenCalled();
    expect(mockAdapter.onReaction).toHaveBeenCalled();
  });

  it("registers SIGINT and SIGTERM handlers", async () => {
    vi.resetModules();
    vi.doMock("@cc2im/core", () => ({
      loadConfig: vi.fn(() => ({
        discord: { token: "test-token" },
        claude: {},
        formatter: {},
        projects: [],
      })),
      saveConfig: vi.fn(),
      addProject: vi.fn(),
      removeProject: vi.fn(),
      Store: vi.fn(() => mockStore),
      SessionManager: vi.fn(() => mockSessionManager),
      Router: vi.fn(() => mockRouter),
      Formatter: vi.fn(() => mockFormatter),
      THREAD_STATUS_ICONS: { active: "🔄", done: "✅" },
    }));
    vi.doMock("../src/adapters/discord.js", () => ({
      DiscordAdapter: vi.fn(() => mockAdapter),
    }));
    vi.doMock("child_process", async (importOriginal) => {
      const mod = await importOriginal<typeof import("child_process")>();
      return { ...mod, execFile: vi.fn() };
    });

    const { main } = await import("../src/index.js");
    await main();

    const signals = processOnSpy.mock.calls.map(([sig]) => sig);
    expect(signals).toContain("SIGINT");
    expect(signals).toContain("SIGTERM");
  });
});
