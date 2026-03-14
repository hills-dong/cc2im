# Design: Per-Project Model Configuration

**Date:** 2026-03-14
**Status:** Approved

## Overview

Allow each project in cc2im to specify which Claude model to use, overriding the global default. This enables different projects to use different models (e.g., opus for complex work, haiku for quick tasks).

## Architecture

The change is minimal: one new optional field on `ProjectConfig`, threaded through to `SessionManager.invoke()`.

## Data Structure

`ProjectConfig` in `types.ts` gains an optional `model` field:

```typescript
export interface ProjectConfig {
  name: string;
  directory: string;
  model?: string;  // optional; overrides global defaultArgs model when set
  platforms: Partial<Record<Platform, boolean>>;
}
```

Config YAML example:

```yaml
projects:
  - name: fast-project
    directory: /path/to/project
    model: claude-haiku-4-5-20251001
    platforms:
      discord: true
  - name: deep-project
    directory: /path/to/other
    # no model → uses whatever --model is in global claude.defaultArgs
    platforms:
      discord: true
```

## Invoke Flow

`SessionManager.invoke()` accepts a new optional `model` parameter. When provided, it strips any existing `--model <value>` from `defaultArgs` and appends `--model <project-model>`.

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

Arg-building logic in `session.ts`:

```typescript
const args = [...this.claudeConfig.defaultArgs];
if (model) {
  // Remove any existing --model <value> pair from defaultArgs
  const idx = args.indexOf("--model");
  if (idx !== -1) args.splice(idx, 2);
  args.push("--model", model);
}
```

Call site in `index.ts` passes `project.model` when invoking:

```typescript
sessionManager.invoke(threadKey, project.directory, existingSessionId, msg.content, ..., project.model)
```

## Components Changed

| File | Change |
|------|--------|
| `src/types.ts` | Add `model?: string` to `ProjectConfig` |
| `src/session.ts` | Add `model?` param to `invoke()`, inject into args |
| `src/index.ts` | Pass `project.model` at all `sessionManager.invoke()` call sites |

## Error Handling

No special error handling needed. If an invalid model name is passed, Claude Code will fail with its own error message, which surfaces to the user through the existing error flow.

## Testing

- Project with `model` set → Claude invoked with correct `--model` arg
- Project without `model` → behavior unchanged (global defaultArgs respected)
- Project with `model` when `defaultArgs` already contains `--model` → project model wins, no duplicate flags
