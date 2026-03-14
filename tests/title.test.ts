import { describe, it, expect, vi, afterEach } from "vitest";
import { execFile as realExecFile } from "child_process";

// Mock child_process before importing the module under test
vi.mock("child_process", async (importOriginal) => {
  const mod = await importOriginal<typeof import("child_process")>();
  return { ...mod, execFile: vi.fn() };
});

const { execFile } = await import("child_process");
const { generateThreadTitle } = await import("../src/index.js");

function makeExecFile(err: Error | null, stdout: string) {
  (execFile as any).mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(err, stdout, "")
  );
}

afterEach(() => vi.clearAllMocks());

describe("generateThreadTitle", () => {
  it("extracts title from stream-json result event", async () => {
    const stdout = [
      '{"type":"system","subtype":"init","session_id":"abc"}',
      '{"type":"assistant","message":{"content":[{"type":"text","text":"用户登录问题排查"}]}}',
      '{"type":"result","subtype":"success","result":"用户登录问题排查","session_id":"abc"}',
    ].join("\n");
    makeExecFile(null, stdout);

    const title = await generateThreadTitle("我的登录一直失败", "claude");
    expect(title).toBe("用户登录问题排查");
  });

  it("truncates title to 15 chars", async () => {
    const long = "这是一个非常非常非常非常非常非常长的标题超过了限制";
    const stdout = `{"type":"result","subtype":"success","result":"${long}","session_id":"abc"}`;
    makeExecFile(null, stdout);

    const title = await generateThreadTitle("消息", "claude");
    expect(title.length).toBeLessThanOrEqual(15);
  });

  it("falls back to userMessage slice when result is empty", async () => {
    const stdout = '{"type":"result","subtype":"success","result":"","session_id":"abc"}';
    makeExecFile(null, stdout);

    const title = await generateThreadTitle("帮我写个单元测试", "claude");
    expect(title).toBe("帮我写个单元测试");
  });

  it("rejects when execFile errors", async () => {
    makeExecFile(new Error("command not found"), "");

    await expect(generateThreadTitle("消息", "claude")).rejects.toThrow("command not found");
  });

  it("passes correct flags to claude", async () => {
    const stdout = '{"type":"result","subtype":"success","result":"测试标题","session_id":"abc"}';
    makeExecFile(null, stdout);

    await generateThreadTitle("消息内容", "claude");

    const [cmd, args] = (execFile as any).mock.calls[0];
    expect(cmd).toBe("claude");
    expect(args).toContain("--print");
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("-p");
  });
});
