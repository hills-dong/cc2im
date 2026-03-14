# Per-Project Model Configuration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each project in config.yaml to specify a `model` field that overrides the global Claude model for that project.

**Architecture:** Add optional `model` field to `ProjectConfig`, thread it through `SessionManager.invoke()` as a parameter, and inject it into the CLI args by replacing any existing `--model` in `defaultArgs`.

**Tech Stack:** TypeScript, Vitest

---

## Chunk 1: Types + SessionManager

### Task 1: Add `model` field to `ProjectConfig`

**Files:**
- Modify: `src/types.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write failing test** — add to `tests/config.test.ts`:

```typescript
it("loads project with optional model field", () => {
  writeFileSync(configPath, `
discord:
  token: "test-token"
lark:
  appId: ""
  appSecret: ""
projects:
  - name: "test"
    directory: "/tmp/test"
    model: "claude-opus-4-6"
    platforms:
      discord: true
claude:
  command: "claude"
  defaultArgs: ["--print"]
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
  const config = loadConfig(configPath);
  expect(config.projects[0].model).toBe("claude-opus-4-6");
});

it("project without model field has undefined model", () => {
  writeFileSync(configPath, `
discord:
  token: "test-token"
lark:
  appId: ""
  appSecret: ""
projects:
  - name: "test"
    directory: "/tmp/test"
    platforms:
      discord: true
claude:
  command: "claude"
  defaultArgs: ["--print"]
  bufferInterval: 500
  timeout: 300000
formatter:
  maxMessageLength:
    discord: 2000
    lark: 30000
  maxConcurrentProcesses: 5
`);
  const config = loadConfig(configPath);
  expect(config.projects[0].model).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --reporter=verbose tests/config.test.ts
```

Expected: FAIL — `model` field is not on the type.

- [ ] **Step 3: Add `model` field to `ProjectConfig` in `src/types.ts`**

In the `ProjectConfig` interface, add after `directory`:

```typescript
model?: string;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --reporter=verbose tests/config.test.ts
```

Expected: all config tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/config.test.ts
git commit -m "feat: add optional model field to ProjectConfig"
```

---

### Task 2: Thread `model` through `SessionManager.invoke()`

**Files:**
- Modify: `src/session.ts`
- Test: `tests/session.test.ts`

- [ ] **Step 1: Write failing tests** — add to `tests/session.test.ts`:

```typescript
it("buildArgs returns defaultArgs unchanged when no model override", () => {
  const manager = new SessionManager(
    { ...mockClaudeConfig, defaultArgs: ["--output-format", "stream-json", "--model", "claude-haiku-4-5-20251001"] },
    mockFormatterConfig,
  );
  const args = manager.buildArgs(null, undefined);
  expect(args).toEqual(["--output-format", "stream-json", "--model", "claude-haiku-4-5-20251001"]);
});

it("buildArgs overrides --model in defaultArgs when model is provided", () => {
  const manager = new SessionManager(
    { ...mockClaudeConfig, defaultArgs: ["--output-format", "stream-json", "--model", "claude-haiku-4-5-20251001"] },
    mockFormatterConfig,
  );
  const args = manager.buildArgs(null, "claude-opus-4-6");
  expect(args).toContain("--model");
  expect(args).toContain("claude-opus-4-6");
  expect(args).not.toContain("claude-haiku-4-5-20251001");
  // No duplicate --model flags
  expect(args.filter(a => a === "--model")).toHaveLength(1);
});

it("buildArgs appends --model when defaultArgs has no existing --model", () => {
  const manager = new SessionManager(
    { ...mockClaudeConfig, defaultArgs: ["--output-format", "stream-json"] },
    mockFormatterConfig,
  );
  const args = manager.buildArgs(null, "claude-opus-4-6");
  expect(args).toEqual(["--output-format", "stream-json", "--model", "claude-opus-4-6"]);
});

it("buildArgs includes --resume when sessionId is provided", () => {
  const manager = new SessionManager(mockClaudeConfig, mockFormatterConfig);
  const args = manager.buildArgs("session-abc", undefined);
  expect(args).toContain("--resume");
  expect(args).toContain("session-abc");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --reporter=verbose tests/session.test.ts
```

Expected: FAIL — `buildArgs` method does not exist.

- [ ] **Step 3: Extract `buildArgs` method and add `model` param to `invoke()`**

In `src/session.ts`, add a `buildArgs` method and update `invoke()`:

```typescript
buildArgs(sessionId: string | null, model?: string): string[] {
  const args = [...this.claudeConfig.defaultArgs];
  if (model) {
    const idx = args.indexOf("--model");
    if (idx !== -1) args.splice(idx, 2);
    args.push("--model", model);
  }
  if (sessionId) {
    args.push("--resume", sessionId);
  }
  return args;
}
```

Then in `invoke()`, replace:

```typescript
const args = [...this.claudeConfig.defaultArgs];
if (sessionId) {
  args.push("--resume", sessionId);
}
```

with:

```typescript
const args = this.buildArgs(sessionId, model);
```

And update the `invoke()` signature to accept `model?`:

```typescript
async invoke(
  threadKey: string,
  projectDir: string,
  sessionId: string | null,
  message: string,
  onEvent: StreamCallback,
  images?: string[],
  onStart?: () => void,
  model?: string,
): Promise<SessionResult>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --reporter=verbose tests/session.test.ts
```

Expected: all session tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session.ts tests/session.test.ts
git commit -m "feat: add model override support to SessionManager.invoke()"
```

---

## Chunk 2: Wire up call sites in index.ts

### Task 3: Pass `project.model` at all `sessionManager.invoke()` call sites

**Files:**
- Modify: `src/index.ts`

There are two call sites:
1. `handleMessage()` — line ~258
2. Pending restart recovery — line ~96

- [ ] **Step 1: Update `handleMessage()` call site**

Find the `sessionManager.invoke(` call in `handleMessage()`. It currently ends with:

```typescript
imagePaths.length > 0 ? imagePaths : undefined,
// When task starts processing (exits queue), update message to "Thinking"
() => {
  adapter.editMessage(threadId!, currentMessageId, "⏳ _Thinking..._").catch(() => {});
},
```

Add `project.model` as the final argument:

```typescript
imagePaths.length > 0 ? imagePaths : undefined,
() => {
  adapter.editMessage(threadId!, currentMessageId, "⏳ _Thinking..._").catch(() => {});
},
project.model,
```

- [ ] **Step 2: Update pending restart recovery call site**

Find the `sessionManager.invoke(` call in the pending restart block (inside `main()`). It currently ends with:

```typescript
thread.session_id,
"cc2im 服务已重启完成，请简短告知用户重启成功并继续之前的工作。",
() => {},
```

Add the model from the project:

```typescript
thread.session_id,
"cc2im 服务已重启完成，请简短告知用户重启成功并继续之前的工作。",
() => {},
undefined,    // images
undefined,    // onStart
project.model,
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: pass project.model to SessionManager at all invoke() call sites"
```
