# Token Stats UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Stats page to show token consumption across time windows (24h/7d/all) with a hierarchical view (global → project → session), highlighting Input/Output and deemphasizing Cache.

**Architecture:** New `getOverviewTokens()` store method with LEFT JOIN subquery → new `/api/stats/overview` endpoint assembling nested response → rewritten Stats.svelte with tab-based time window switcher, summary cards, collapsible project cards with session tables.

**Tech Stack:** SQLite (better-sqlite3), Node.js HTTP API, Svelte 5

**Test Scene:** Scene 3 (TDD) — test-first development
**requirement_name:** `token-stats-ui-optimization`
**Test documents:** `docs/hills-test/token-stats-ui-optimization/`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/src/store.ts` | Modify | Add `OverviewTokenRow` interface + `getOverviewTokens(since)` method |
| `packages/server/src/contracts/api.ts` | Modify | Add `TokenTotals`, `SessionOverview`, `ProjectOverview`, `OverviewResponse` types |
| `packages/server/src/api.ts` | Modify | Add `GET /api/stats/overview?window=` route with nested response assembly |
| `packages/ui/src/lib/Stats.svelte` | Rewrite | Time window tabs + summary cards + collapsible project cards + session tables |
| `packages/core/tests/store-tokens.test.ts` | Modify | Add unit tests for `getOverviewTokens()` |
| `test/e2e/stats-*.spec.ts` | Modify/Create | E2E tests for new Stats page |

---

## Task 1: Unit Test — case analysis + code generation

**Skill:** `hills-unit-test` (Sub-Agent A: Case Analyst → Sub-Agent B: Test Developer)

- [ ] **Step 1: `hills-unit-test` Case Analyst — generate unit test case checklist**

Analyze `packages/core/src/store.ts` and the design spec. Output checklist to `docs/hills-test/token-stats-ui-optimization/unit-test-cases.md`.

Target methods:
- `Store.getOverviewTokens(since)` — time filtering, JOIN dedup, multi-project grouping, ordering, empty data, orphan sessions

- [ ] **Step 2: `hills-unit-test` Test Developer — generate test code from checklist**

Read the checklist, write test code to `packages/core/tests/store-tokens.test.ts`.

Reference test code (from design):

```ts
describe("getOverviewTokens", () => {
  it("returns all sessions grouped by project when since is null", () => {
    store.upsertThread("t1", "web", "ch1", "sess-1", "proj-a");
    store.upsertThread("t2", "discord", "ch2", "sess-2", "proj-a");
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 1000, 200);
    store.saveTokenUsage("sess-2", "proj-a", "opus", 200, 100, 500, 100);

    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    expect(rows[0].sessionId).toBe("sess-2");
    expect(rows[0].projectName).toBe("proj-a");
    expect(rows[0].platform).toBe("discord");
    expect(rows[1].sessionId).toBe("sess-1");
    expect(rows[1].platform).toBe("web");
  });

  it("sums multiple token_usage rows per session", () => {
    store.upsertThread("t1", "web", "ch1", "sess-1", "proj-a");
    store.saveTokenUsage("sess-1", "proj-a", "opus", 100, 50, 1000, 200);
    store.saveTokenUsage("sess-1", "proj-a", "opus", 80, 40, 800, 100);
    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].inputTokens).toBe(180);
    expect(rows[0].outputTokens).toBe(90);
    expect(rows[0].cacheReadTokens).toBe(1800);
    expect(rows[0].cacheCreationTokens).toBe(300);
  });

  it("returns rows from multiple projects sorted by project name", () => {
    store.saveTokenUsage("s1", "proj-b", "opus", 100, 50, 0, 0);
    store.saveTokenUsage("s2", "proj-a", "opus", 200, 100, 0, 0);
    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(2);
    expect(rows[0].projectName).toBe("proj-a");
    expect(rows[1].projectName).toBe("proj-b");
  });

  it("filters by since timestamp", () => {
    store.saveTokenUsage("sess-old", "proj-a", "opus", 100, 50, 0, 0);
    (store as any).db.prepare(`
      INSERT INTO token_usage (session_id, project_name, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-2 days'))
    `).run("sess-old2", "proj-a", "opus", 999, 999, 0, 0);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rows = store.getOverviewTokens(since);
    expect(rows.every(r => r.sessionId !== "sess-old2")).toBe(true);
  });

  it("returns empty array when no data", () => {
    const rows = store.getOverviewTokens(null);
    expect(rows).toEqual([]);
  });

  it("handles sessions with no matching thread (platform is null)", () => {
    store.saveTokenUsage("orphan-sess", "proj-x", "opus", 50, 25, 0, 0);
    const rows = store.getOverviewTokens(null);
    expect(rows).toHaveLength(1);
    expect(rows[0].platform).toBeNull();
    expect(rows[0].sessionName).toBeNull();
  });
});
```

---

## Task 2: Unit Test — quality review

**Skill:** `hills-test-quality` (Sub-Agent: Quality Reviewer, read-only)

- [ ] **Step 1: `hills-test-quality` — review unit test code**

Review `packages/core/tests/store-tokens.test.ts` against the checklist.
Output report to `docs/hills-test/token-stats-ui-optimization/quality-review.md`.

If BLOCKING → route back to Task 1 Test Developer for fixes (max 3 rounds).

---

## Task 3: TDD Red — run unit tests, expect failures

**Skill:** `hills-test-run` (Sub-Agent: Test Executor, read-only)

- [ ] **Step 1: `hills-test-run` — run unit tests**

Run: `cd packages/core && npx vitest run tests/store-tokens.test.ts`
Expected: FAIL — `store.getOverviewTokens is not a function`
Verify tests fail for the RIGHT reason (missing implementation, not broken test logic).
Output report to `docs/hills-test/token-stats-ui-optimization/test-run.md`.

---

## Task 4: Implement backend — store + API contracts + API route

**Role:** Business Developer (does NOT touch test code)

- [ ] **Step 1: Add `OverviewTokenRow` interface to store.ts**

Add after `DailyTokenStats` (line 43) in `packages/core/src/store.ts`:

```ts
export interface OverviewTokenRow {
  projectName: string;
  sessionId: string;
  platform: string | null;
  sessionName: string | null;
  sessionCreatedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
```

- [ ] **Step 2: Implement `getOverviewTokens()` method**

Add before `close()` in the `Store` class:

```ts
getOverviewTokens(since: string | null): OverviewTokenRow[] {
  const sql = `
    SELECT
      tu.project_name AS projectName,
      tu.session_id AS sessionId,
      ts.platform,
      ts.sessionName,
      ts.sessionCreatedAt,
      COALESCE(SUM(tu.input_tokens), 0) AS inputTokens,
      COALESCE(SUM(tu.output_tokens), 0) AS outputTokens,
      COALESCE(SUM(tu.cache_read_tokens), 0) AS cacheReadTokens,
      COALESCE(SUM(tu.cache_creation_tokens), 0) AS cacheCreationTokens
    FROM token_usage tu
    LEFT JOIN (
      SELECT session_id,
             MIN(platform) AS platform,
             MIN(name) AS sessionName,
             MIN(created_at) AS sessionCreatedAt
      FROM threads
      GROUP BY session_id
    ) ts ON ts.session_id = tu.session_id
    WHERE (? IS NULL OR tu.created_at >= ?)
    GROUP BY tu.project_name, tu.session_id
    ORDER BY tu.project_name, SUM(tu.input_tokens + tu.output_tokens) DESC
  `;
  return this.db.prepare(sql).all(since, since) as OverviewTokenRow[];
}
```

- [ ] **Step 3: Add API contract types**

Append to `packages/server/src/contracts/api.ts`:

```ts
/** Token stats overview */
export type WindowParam = "24h" | "7d" | "all";

export interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface SessionOverview {
  sessionId: string;
  platform: string | null;
  name: string | null;
  createdAt: string | null;
  total: TokenTotals;
}

export interface ProjectOverview {
  name: string;
  total: TokenTotals;
  sessions: SessionOverview[];
}

export interface OverviewResponse {
  window: WindowParam;
  total: TokenTotals;
  projects: ProjectOverview[];
}
```

- [ ] **Step 4: Add API route**

Add before the existing `/api/stats/tokens` block in `packages/server/src/api.ts` `handleApi()`:

```ts
// GET /api/stats/overview?window=24h|7d|all
if (method === "GET" && pathname === "/api/stats/overview") {
  const windowParam = url.searchParams.get("window");
  if (!windowParam || !["24h", "7d", "all"].includes(windowParam)) {
    return error(res, 400, "VALIDATION_ERROR", "window must be 24h, 7d, or all");
  }
  let since: string | null = null;
  if (windowParam === "24h") {
    since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  } else if (windowParam === "7d") {
    since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  const rows = ctx.store.getOverviewTokens(since);

  const zeroTotals = () => ({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });
  const projectMap = new Map<string, { total: ReturnType<typeof zeroTotals>; sessions: Array<{
    sessionId: string; platform: string | null; name: string | null;
    createdAt: string | null; total: ReturnType<typeof zeroTotals>;
  }> }>();

  const grandTotal = zeroTotals();
  for (const row of rows) {
    if (!projectMap.has(row.projectName)) {
      projectMap.set(row.projectName, { total: zeroTotals(), sessions: [] });
    }
    const proj = projectMap.get(row.projectName)!;
    const sessionTotal = {
      input: row.inputTokens,
      output: row.outputTokens,
      cacheRead: row.cacheReadTokens,
      cacheCreation: row.cacheCreationTokens,
    };
    proj.sessions.push({
      sessionId: row.sessionId,
      platform: row.platform,
      name: row.sessionName,
      createdAt: row.sessionCreatedAt,
      total: sessionTotal,
    });
    proj.total.input += row.inputTokens;
    proj.total.output += row.outputTokens;
    proj.total.cacheRead += row.cacheReadTokens;
    proj.total.cacheCreation += row.cacheCreationTokens;
    grandTotal.input += row.inputTokens;
    grandTotal.output += row.outputTokens;
    grandTotal.cacheRead += row.cacheReadTokens;
    grandTotal.cacheCreation += row.cacheCreationTokens;
  }

  const projects = [...projectMap.entries()]
    .sort((a, b) => (b[1].total.input + b[1].total.output) - (a[1].total.input + a[1].total.output))
    .map(([name, data]) => ({ name, ...data }));

  return json(res, 200, { window: windowParam, total: grandTotal, projects });
}
```

- [ ] **Step 5: Verify build passes**

Run: `cd packages/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/store.ts packages/server/src/contracts/api.ts packages/server/src/api.ts
git commit -m "feat: add getOverviewTokens store method and /api/stats/overview endpoint"
```

---

## Task 5: TDD Green — run unit tests, all should pass

**Skill:** `hills-test-run` (Sub-Agent: Test Executor, read-only)

- [ ] **Step 1: `hills-test-run` — run unit tests**

Run: `cd packages/core && npx vitest run tests/store-tokens.test.ts`
Expected: ALL PASS
Output report to `docs/hills-test/token-stats-ui-optimization/test-run.md` (append `## Round 2`).

If failure:
- Real bug → route back to Task 4 Business Developer
- Test defect → route to NEW Test Developer agent to fix

---

## Task 6: E2E Test — case analysis + code generation

**Skill:** `hills-e2e-test` (Sub-Agent A: Case Analyst → Sub-Agent B: Test Developer)

- [ ] **Step 1: `hills-e2e-test` Case Analyst — generate E2E test case checklist**

Analyze Stats.svelte design spec. Output checklist to `docs/hills-test/token-stats-ui-optimization/e2e-test-cases.md`.

Target scenarios:
- Time window tab switching (24h / 7d / all)
- Summary cards display (Input, Output, Cache)
- Project card collapse/expand
- Session table content (Platform icon, Session name, Time, In, Out)
- Empty state ("No token usage data in this time window.")
- API error handling

- [ ] **Step 2: `hills-e2e-test` Test Developer — generate Playwright test code from checklist**

Read the checklist, write test code to `test/e2e/stats-*.spec.ts`.

---

## Task 7: E2E Test — quality review

**Skill:** `hills-test-quality` (Sub-Agent: Quality Reviewer, read-only)

- [ ] **Step 1: `hills-test-quality` — review E2E test code**

Review `test/e2e/stats-*.spec.ts` against the checklist.
Output report to `docs/hills-test/token-stats-ui-optimization/quality-review.md` (append `## Round 2`).

If BLOCKING → route back to Task 6 Test Developer for fixes (max 3 rounds).

---

## Task 8: Implement frontend — Stats.svelte rewrite

**Role:** Business Developer (does NOT touch test code)

- [ ] **Step 1: Rewrite Stats.svelte**

Replace `packages/ui/src/lib/Stats.svelte` with new layout:

```svelte
<script lang="ts">
  type WindowParam = "24h" | "7d" | "all";

  interface TokenTotals {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  }

  interface SessionOverview {
    sessionId: string;
    platform: string | null;
    name: string | null;
    createdAt: string | null;
    total: TokenTotals;
  }

  interface ProjectOverview {
    name: string;
    total: TokenTotals;
    sessions: SessionOverview[];
  }

  interface OverviewData {
    window: WindowParam;
    total: TokenTotals;
    projects: ProjectOverview[];
  }

  let activeWindow = $state<WindowParam>("24h");
  let data = $state<OverviewData | null>(null);
  let loading = $state(false);
  let error = $state("");
  let expandedProjects = $state<Set<string>>(new Set());

  const WINDOWS: { value: WindowParam; label: string }[] = [
    { value: "24h", label: "最近 24h" },
    { value: "7d", label: "最近 7天" },
    { value: "all", label: "全部" },
  ];

  const PLATFORM_ICONS: Record<string, string> = {
    discord: "🟣",
    lark: "🔵",
    web: "🟢",
  };

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  function fmtFull(n: number): string {
    return n.toLocaleString();
  }

  function fmtTime(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function platformIcon(p: string | null): string {
    return p ? PLATFORM_ICONS[p] ?? "⚪" : "⚪";
  }

  function toggleProject(name: string) {
    const next = new Set(expandedProjects);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    expandedProjects = next;
  }

  async function loadOverview() {
    loading = true;
    error = "";
    data = null;
    try {
      const res = await fetch(`/api/stats/overview?window=${activeWindow}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (e) {
      error = "Failed to load stats: " + String(e);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    const _w = activeWindow; // track dependency
    loadOverview();
  });
</script>

<div class="stats-page">
  <div class="page-header">
    <h1>Token Statistics</h1>
  </div>

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  <!-- Time window tabs -->
  <div class="window-tabs">
    {#each WINDOWS as w}
      <button
        class="tab-btn"
        class:active={activeWindow === w.value}
        onclick={() => { activeWindow = w.value; }}
      >{w.label}</button>
    {/each}
  </div>

  {#if loading}
    <div class="loading-text">Loading statistics…</div>
  {:else if data}
    <!-- Summary cards -->
    <div class="summary-cards">
      <div class="card primary">
        <div class="card-label">Input Tokens</div>
        <div class="card-value">{fmt(data.total.input)}</div>
        <div class="card-sub">{fmtFull(data.total.input)}</div>
      </div>
      <div class="card primary">
        <div class="card-label">Output Tokens</div>
        <div class="card-value">{fmt(data.total.output)}</div>
        <div class="card-sub">{fmtFull(data.total.output)}</div>
      </div>
      <div class="card secondary">
        <div class="card-label">Cache (read / create)</div>
        <div class="card-value-sm">{fmt(data.total.cacheRead)} / {fmt(data.total.cacheCreation)}</div>
        <div class="card-sub">{fmtFull(data.total.cacheRead)} / {fmtFull(data.total.cacheCreation)}</div>
      </div>
    </div>

    <!-- Project list -->
    {#if data.projects.length === 0}
      <div class="empty-hint">No token usage data in this time window.</div>
    {:else}
      {#each data.projects as proj}
        <div class="project-card">
          <button class="project-header" onclick={() => toggleProject(proj.name)}>
            <span class="collapse-icon">{expandedProjects.has(proj.name) ? "▼" : "▶"}</span>
            <span class="project-name">{proj.name}</span>
            <span class="project-summary">in: {fmt(proj.total.input)} / out: {fmt(proj.total.output)}</span>
          </button>

          {#if expandedProjects.has(proj.name)}
            <div class="session-table-wrap">
              <table class="session-table">
                <thead>
                  <tr>
                    <th class="col-platform">Platform</th>
                    <th class="col-session">Session</th>
                    <th class="col-time">Time</th>
                    <th class="col-num">In</th>
                    <th class="col-num">Out</th>
                  </tr>
                </thead>
                <tbody>
                  {#each proj.sessions as sess}
                    <tr>
                      <td class="col-platform">{platformIcon(sess.platform)} {sess.platform ?? "unknown"}</td>
                      <td class="col-session mono">{sess.name ?? sess.sessionId.slice(0, 12)}</td>
                      <td class="col-time mono dimmed">{fmtTime(sess.createdAt)}</td>
                      <td class="col-num">{fmt(sess.total.input)}</td>
                      <td class="col-num">{fmt(sess.total.output)}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .stats-page {
    padding: 32px;
    overflow-y: auto;
    height: 100%;
    max-width: 960px;
  }

  .page-header h1 {
    font-size: 22px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 24px;
  }

  .error-msg {
    background: #3a1a1a;
    border: 1px solid #f87171;
    color: #f87171;
    border-radius: 6px;
    padding: 10px 16px;
    margin-bottom: 16px;
    font-size: 13px;
  }

  .window-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
  }

  .tab-btn {
    padding: 8px 20px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-sidebar);
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn:hover {
    border-color: var(--accent);
    color: var(--text-primary);
  }

  .tab-btn.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }

  .summary-cards {
    display: flex;
    gap: 14px;
    margin-bottom: 28px;
  }

  .card {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 20px;
    flex: 1;
  }

  .card.primary {
    border-color: var(--accent);
  }

  .card.secondary {
    opacity: 0.7;
  }

  .card-label {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 6px;
  }

  .card-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.2;
  }

  .card-value-sm {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-secondary);
    line-height: 1.2;
  }

  .card-sub {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 3px;
  }

  .loading-text {
    color: var(--text-secondary);
    font-size: 13px;
    font-style: italic;
  }

  .empty-hint {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 13px;
    padding: 20px 0;
  }

  .project-card {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 12px;
    overflow: hidden;
  }

  .project-header {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 18px;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 14px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .project-header:hover {
    background: rgba(76, 201, 240, 0.04);
  }

  .collapse-icon {
    font-size: 11px;
    color: var(--text-secondary);
    width: 14px;
  }

  .project-name {
    font-weight: 600;
    color: var(--accent);
  }

  .project-summary {
    color: var(--text-secondary);
    font-size: 12px;
    margin-left: auto;
  }

  .session-table-wrap {
    padding: 0 18px 14px;
    overflow-x: auto;
  }

  .session-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .session-table thead th {
    text-align: left;
    padding: 6px 10px;
    color: var(--text-secondary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
  }

  .session-table tbody tr {
    border-bottom: 1px solid rgba(42, 42, 78, 0.3);
  }

  .session-table tbody tr:hover {
    background: rgba(76, 201, 240, 0.04);
  }

  .session-table tbody td {
    padding: 7px 10px;
    color: var(--text-primary);
  }

  .col-num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .col-platform { width: 100px; }
  .col-time { width: 110px; }
  .col-num { width: 80px; }

  .mono {
    font-family: monospace;
    font-size: 12px;
  }

  .dimmed {
    color: var(--text-secondary);
  }
</style>
```

- [ ] **Step 2: Verify UI build passes**

Run: `cd packages/ui && npx vite build`
Expected: Build success with no errors

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/Stats.svelte
git commit -m "feat(ui): rewrite Stats page with time windows and hierarchical project/session view"
```

---

## Task 9: Run all tests — final validation

**Skill:** `hills-test-run` (Sub-Agent: Test Executor, read-only)

- [ ] **Step 1: Build all packages**

Run: `npm run build`
Expected: No errors

- [ ] **Step 2: `hills-test-run` — run unit tests + E2E tests**

Run unit: `cd packages/core && npx vitest run tests/store-tokens.test.ts`
Run E2E: `npx playwright test test/e2e/stats-*.spec.ts`
Expected: ALL PASS
Output report to `docs/hills-test/token-stats-ui-optimization/test-run.md` (append `## Round 3`).

If failure:
- Real bug → route to Task 4 or Task 8 Business Developer
- Test defect → route to NEW Test Developer agent

---

## Task 10: Visual walkthrough verification

**Skill:** `hills-test-verify` (Sub-Agent: Walkthrough Verifier, read-only)

- [ ] **Step 1: Restart service**

Run: `npm run build && cc2im restart`

- [ ] **Step 2: `hills-test-verify` — Playwright screenshot verification**

Verify:
- Three time window tabs are visible and switchable
- Summary cards show correct Input, Output, Cache values
- Project cards collapse/expand correctly
- Session table shows Platform icon, Session name, Time, In, Out
- Empty state shows "No token usage data in this time window."
- Data refreshes when switching time windows

Output report to `docs/hills-test/token-stats-ui-optimization/walkthrough.md`.
Screenshots to `docs/hills-test/token-stats-ui-optimization/screenshots/`.

---

## Pipeline Summary

```
Task 1:  hills-unit-test    (Case Analyst → Test Developer)
Task 2:  hills-test-quality (Quality Reviewer)
Task 3:  hills-test-run     (TDD Red — expect fail)
Task 4:  Business Developer (store + API contracts + API route)
Task 5:  hills-test-run     (TDD Green — expect pass)
Task 6:  hills-e2e-test     (Case Analyst → Test Developer)
Task 7:  hills-test-quality (Quality Reviewer)
Task 8:  Business Developer (Stats.svelte rewrite)
Task 9:  hills-test-run     (all tests — final validation)
Task 10: hills-test-verify  (visual walkthrough)
```

**Sub-Agent Iron Rule:** Each skill invocation uses a fresh sub-agent. Case analyst, test developer, business developer, quality reviewer, test executor, and walkthrough verifier NEVER share agents.
