# Test Quality Report: token-stats-ui-optimization

## Round 2

**Date:** 2026-03-18
**Reviewed by:** hills-test-quality
**Files reviewed:**
- `packages/core/tests/store-tokens.test.ts`
- `test/e2e/stats-display.spec.ts`
- `test/e2e/stats-extended.spec.ts`
- `test/e2e/stats-missing.spec.ts`

### 1. Checklist Cross-Check

#### Unit Tests

Checklist: `docs/hills-test/token-stats-ui-optimization/unit-test-cases.md` (22 items)
Test code: `packages/core/tests/store-tokens.test.ts` lines 60-348 (20 `it()` blocks)

| # | Checklist Item | Status | Test `it()` block |
|---|---------------|--------|-------------------|
| 1 | since=null returns all aggregated records | COVERED | "returns aggregated token_usage records for all sessions when since=null" (L74) |
| 2 | since filters records after specified time | COVERED | "returns only records after the specified since time" (L92) |
| 3 | Same session multi-record aggregation | COVERED | "correctly aggregates multiple token_usage records for the same session" (L107) |
| 4 | Group by project_name | COVERED | "groups by project_name so sessions from different projects do not mix" (L120) |
| 5 | Sort sessions by token total descending | COVERED | "sorts sessions within the same project by total tokens descending" (L131) |
| 6 | Sort projects by name ascending | COVERED | "sorts different projects by project_name ascending" (L142) |
| 7 | LEFT JOIN: thread exists -> non-null fields | COVERED | "returns platform/sessionName/sessionCreatedAt from thread when thread exists" (L152) |
| 8 | LEFT JOIN: no thread -> null fields | COVERED | "returns null for platform/sessionName/sessionCreatedAt when no thread exists" (L163) |
| 9 | Multiple threads same session -> no token duplication | COVERED | "does not duplicate token counts when multiple threads share the same session_id" (L173) |
| 10 | Empty database -> empty array | COVERED | "returns an empty array when the database is empty" (L183) |
| 11 | since equals created_at -> included (>=) | COVERED | "includes records where created_at equals since (>= semantics)" (L188) |
| 12 | since later than all records -> empty array | COVERED | "returns an empty array when since is later than all records" (L198) |
| 13 | All token fields 0 -> COALESCE returns 0 | COVERED | "returns 0 for all token fields when all values are 0" (L208) |
| 14 | Return fields match OverviewTokenRow interface | COVERED | "returns objects with all OverviewTokenRow fields" (L219) |
| 15 | Token fields are type number | COVERED | "returns token fields as numbers not strings" (L237) |
| 16 | Multi-project multi-session aggregation | COVERED | "correctly aggregates across multiple projects with multiple sessions each" (L248) |
| 17 | Same session_id across different projects | COVERED | "aggregates separately when the same session_id appears under different projects" (L281) |
| 18 | MIN selection for multi-thread | COVERED | "selects MIN(platform), MIN(name), MIN(created_at) when multiple threads exist for a session" (L295) |
| 19 | Idempotent (multiple calls same result) | COVERED | "returns identical results on consecutive calls (idempotent)" (L306) |
| 20 | No side effects (read-only) | COVERED | "does not modify the database (no side effects)" (L315) |
| 21 | saveTokenUsage -> immediate read | COVERED | "reads data written by saveTokenUsage immediately" (L326) |
| 22 | upsertThread update -> correct JOIN | COVERED | "joins correctly after upsertThread updates the session_id of a thread" (L336) |

**Unit coverage: 22/22 items covered**

No orphan tests detected. All 20 `it()` blocks map to checklist items (items 1-22 map to 20 tests; some tests cover multiple aspects).

#### E2E Tests

Checklist: `docs/hills-test/token-stats-ui-optimization/e2e-test-cases.md` (44 items, reviewing P0+P1 = 37 items)

| # | Checklist Item (P0/P1) | Status | File & Test Name |
|---|----------------------|--------|------------------|
| 1 | tabs-render-three-buttons (P0) | COVERED | stats-display: "tabs-render-three-buttons" |
| 2 | tabs-default-active-24h (P0) | COVERED | stats-display: "tabs-default-active-24h" |
| 3 | tabs-switch-to-7d (P0) | COVERED | stats-display: "tabs-switch-to-7d" |
| 4 | tabs-switch-to-all (P1) | COVERED | stats-display: "tabs-switch-to-all" |
| 5 | tabs-switch-triggers-fetch (P0) | COVERED | stats-display: "tabs-switch-triggers-fetch" |
| 6 | tabs-rapid-switch-no-corruption (P1) | COVERED | stats-display: "tabs-rapid-switch-no-corruption" |
| 7 | cards-render-three-cards (P0) | COVERED | stats-display: "cards-render-three-cards" |
| 8 | cards-input-label-value (P0) | COVERED | stats-display: "cards-input-label-value" |
| 9 | cards-output-label-value (P0) | COVERED | stats-display: "cards-output-label-value" |
| 10 | cards-cache-read-create (P1) | COVERED | stats-display: "cards-cache-read-create" |
| 11 | cards-values-match-api (P0) | COVERED | stats-extended: "cards-values-match-api" |
| 12 | cards-update-on-tab-switch (P0) | COVERED | stats-display: "cards-update-on-tab-switch" |
| 13 | cards-format-thousands (P1) | COVERED | stats-display: "cards-format-thousands" |
| 16 | cards-no-invalid-values (P0) | COVERED | stats-display: "cards-no-invalid-values" |
| 17 | projects-render-list (P0) | COVERED | stats-display: "projects-render-list" |
| 18 | projects-name-summary (P0) | COVERED | stats-display: "projects-name-summary" |
| 19 | projects-default-collapsed (P0) | COVERED | stats-display: "projects-default-collapsed" |
| 20 | projects-expand-on-click (P0) | COVERED | stats-display: "projects-expand-on-click" |
| 21 | projects-collapse-on-click (P0) | COVERED | stats-display: "projects-collapse-on-click" |
| 22 | projects-multi-expand (P1) | COVERED | stats-display: "projects-multi-expand" |
| 23 | projects-summary-matches-api (P1) | COVERED | stats-extended: "projects-summary-matches-api" |
| 24 | projects-tab-switch-reloads (P1) | COVERED | stats-display: "projects-tab-switch-reloads" |
| 25 | session-table-columns (P0) | COVERED | stats-display: "session-table-columns" |
| 26 | session-table-rows (P0) | COVERED | stats-display: "session-table-rows" |
| 27 | session-platform-display (P1) | COVERED | stats-display: "session-platform-display" |
| 28 | session-name-or-id (P1) | COVERED | stats-display: "session-name-or-id" |
| 29 | session-time-format (P1) | COVERED | stats-display: "session-time-format" |
| 30 | session-token-values (P1) | COVERED | stats-display: "session-token-values" |
| 32 | loading-shown-during-fetch (P0) | COVERED | stats-missing: "loading-shown-during-fetch" |
| 33 | loading-shown-on-tab-switch (P1) | COVERED | stats-missing: "loading-shown-on-tab-switch" |
| 34 | empty-state-no-data (P0) | COVERED | stats-missing: "empty-state-no-data" |
| 35 | empty-cards-show-zero (P1) | COVERED | stats-missing: "empty-cards-show-zero" |
| 36 | error-api-500 (P0) | COVERED | stats-missing: "error-api-500" |
| 37 | error-network-failure (P1) | COVERED | stats-missing: "error-network-failure" |
| 38 | error-clears-on-retry (P1) | COVERED | stats-missing: "error-clears-on-retry" |
| 39 | no-console-errors (P1) | COVERED | stats-missing: "no-console-errors" |
| 40 | state-tab-resets-on-reload (P1) | COVERED | stats-extended: "state-tab-resets-on-reload" |
| 42 | navigate-to-stats (P0) | COVERED | stats-display: "navigate-to-stats" |
| 44 | tabs-always-visible (P1) | COVERED | stats-extended: "tabs-always-visible" |

**E2E coverage: 39/39 P0+P1 items covered** (cases #14, #15, #31, #41, #43 are P2, not required)

No orphan tests detected. All E2E test blocks map to checklist items.

### 2. False Positive Detection

Scanned all `it()`/`test()` blocks across 4 files (20 unit + 30 E2E = 50 total).

| # | Pattern | File:Line | Code Snippet | Severity |
|---|---------|-----------|-------------|----------|
| 1 | Weak assertion (pattern #5: assertion doesn't fully match description) | store-tokens.test.ts:152-161 | `expect(rows[0].platform).not.toBeNull()` — test says "returns platform/sessionName/sessionCreatedAt from thread" but only asserts non-null, not the actual expected values ("web", "my-session") | Warning |
| 2 | If-guard silent skip (pattern #1) | stats-display.spec.ts:311 | `test.skip(apiData.projects.length === 0, ...)` — uses Playwright's `test.skip()` which properly marks as skipped (not silent), acceptable pattern | Pass |
| 3 | Missing assertion (pattern #7) | stats-display.spec.ts:230-246 | `cards-update-on-tab-switch` captures `cardValuesBefore` but never compares it to after-values; only asserts cards are visible | Warning |

All other 47 test blocks passed the 8 deadly patterns scan with no issues found:
- No catch-swallowing exceptions
- No always-true assertions
- No weak disjunctions
- No known-bug workarounds
- No catch-false patterns
- No if-guard silent skips (Playwright `test.skip()` is the proper conditional skip mechanism)

### 3. Test-Type Specific Checks

#### Unit Tests

| # | Check | File:Line | Details | Severity |
|---|-------|-----------|---------|----------|
| 3a-1 | Over-mocking | store-tokens.test.ts:60-348 | No mocking used. Tests use a real SQLite database (`new Store(TEST_DB)`), cleaned up in `afterEach`. This is ideal for a data-layer test. | Pass |
| 3a-2 | Over-mocking | store-tokens.test.ts:93-94 | Direct `db.prepare().run()` used to insert records with specific `created_at` values. This is acceptable — it bypasses `saveTokenUsage` only to control timestamps, not to avoid real DB behavior. | Pass |
| 3b-1 | Assertion granularity | store-tokens.test.ts:152-161 | "returns platform/sessionName/sessionCreatedAt from thread when thread exists" — only asserts `not.toBeNull()` for 3 fields instead of checking exact values. The test calls `upsertThread("thread-1", "web", "ch-1", "sess-1", "proj-a", "my-session")` so expected values are known. | Warning |
| 3b-2 | Assertion granularity | store-tokens.test.ts:74-90 | Good granularity: checks all 4 token fields for proj-a and 2 for proj-b with exact values. | Pass |
| 3c-1 | Test isolation | store-tokens.test.ts:63-72 | Each test uses fresh `Store` instance with `beforeEach`/`afterEach` cleanup including WAL/SHM files. Excellent isolation. | Pass |

#### E2E Tests

| # | Check | File:Line | Details | Severity |
|---|-------|-----------|---------|----------|
| E1 | `page.waitForTimeout()` | All 3 stats E2E files | Zero occurrences of `page.waitForTimeout()`. All waits use condition-based `expect().toBeVisible()`, `waitForResponse()`, or the `waitForDataLoaded()` helper. | Pass |
| E2 | Condition-based waits | stats-missing.spec.ts:31-33 | Loading test uses `setTimeout(r, 500)` inside `page.route()` to simulate network delay. This is a route-level delay, not `waitForTimeout`. Acceptable pattern. | Pass |
| E3 | Proper API mocking | stats-display.spec.ts:251-261 | `page.route()` used to mock API with known data for formatting test. Clean pattern. | Pass |
| E4 | Data-dependent skips | stats-display.spec.ts:311,335,357,377,404,429,460,486,508,547,578 | Multiple tests use `test.skip(apiData.projects.length === 0, ...)`. These tests depend on seed data existing. If 24h window has no data, 11 E2E tests will be skipped. This is a systemic risk. | Warning |

### 4. Quality Score

**Result: Warning**

**Reasoning:**

No blocking issues found:
- All 22 unit checklist items covered (22/22)
- All 39 P0+P1 E2E checklist items covered (39/39)
- No deadly patterns detected at blocking severity
- No over-mocking in unit tests
- No `page.waitForTimeout()` in E2E tests

Warnings identified (3):
1. **Unit test assertion granularity** (store-tokens.test.ts:152-161): The "thread exists" test only asserts `not.toBeNull()` instead of checking exact values like `"web"` and `"my-session"`. This weakens the test's ability to catch regressions where the wrong field is returned. Recommend adding exact value assertions.
2. **Missing comparison assertion** (stats-display.spec.ts:230-246): `cards-update-on-tab-switch` captures before-text but never compares it to after-text. The test only verifies cards remain visible after tab switch, not that values actually changed. This could pass even if the tab switch does not update data.
3. **Seed data dependency** (11 E2E tests): Many E2E tests will be skipped if the 24h window has no data. While `test.skip()` is the correct mechanism, the high number of skip-eligible tests means coverage can silently degrade. Recommend ensuring seed data always exists in the 24h window for E2E runs, or using API mocks for deterministic testing.
