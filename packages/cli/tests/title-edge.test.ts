import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("child_process")>();
  return { ...mod, execFile: vi.fn() };
});

const { execFile } = await import("child_process");
const { generateThreadTitle } = await import("../src/index.js");

function makeExecFile(err: Error | null, stdout: string) {
  (execFile as any).mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(err, stdout, ""),
  );
}

afterEach(() => vi.clearAllMocks());

describe("generateThreadTitle edge cases", () => {
  it("returns 'New conversation' for empty userMessage and no result", async () => {
    // Empty result + empty userMessage.slice(0,15) = "" → "New conversation"
    const stdout = '{"type":"result","subtype":"success","result":"","session_id":"abc"}';
    makeExecFile(null, stdout);

    const title = await generateThreadTitle("", "claude");
    expect(title).toBe("New conversation");
  });

  it("handles non-JSON lines mixed with valid JSON", async () => {
    const stdout = [
      "some debug output",
      '{"type":"system","subtype":"init"}',
      "WARNING: something",
      '{"type":"result","subtype":"success","result":"标题结果","session_id":"abc"}',
      "trailing garbage",
    ].join("\n");
    makeExecFile(null, stdout);

    const title = await generateThreadTitle("msg", "claude");
    expect(title).toBe("标题结果");
  });

  it("falls back to userMessage when stdout has no result event", async () => {
    const stdout = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"blah"}]}}',
    ].join("\n");
    makeExecFile(null, stdout);

    const title = await generateThreadTitle("这是一段用户消息", "claude");
    expect(title).toBe("这是一段用户消息");
  });

  it("falls back to userMessage truncated to 15 chars when no result", async () => {
    makeExecFile(null, "");

    const title = await generateThreadTitle("这是一段超级无敌非常长的用户消息", "claude");
    expect(title).toBe("这是一段超级无敌非常长的用户消");
  });
});
