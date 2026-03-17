# Quality Review: token-stats-ui-optimization

## Round 1

**Date:** 2026-03-18
**Reviewed by:** hills-test-quality
**Files reviewed:**
- `packages/core/tests/store-tokens.test.ts` (lines 60-348)

### 1. Checklist Cross-Check

| Checklist Item | Status | Details |
|---|---|---|
| since=null 时返回所有 token_usage 记录的聚合 | Covered | Line 74: `it("returns aggregated token_usage records...")` |
| since 指定时间后仅返回该时间之后的记录 | Covered | Line 92: `it("returns only records after the specified since time")` |
| 同一 session 多条 token_usage 正确聚合求和 | Covered | Line 107: `it("correctly aggregates multiple token_usage records...")` |
| 按 project_name 分组，不同 project 的 session 不混淆 | Covered | Line 120: `it("groups by project_name so sessions from different projects do not mix")` |
| 同一 project 下多个 session 按 token 总量降序排列 | Covered | Line 131: `it("sorts sessions within the same project by total tokens descending")` |
| 不同 project 按 project_name 排序 | Covered | Line 142: `it("sorts different projects by project_name ascending")` |
| LEFT JOIN threads：有对应 thread 时返回 platform/sessionName/sessionCreatedAt | Covered | Line 152: `it("returns platform/sessionName/sessionCreatedAt from thread when thread exists")` |
| LEFT JOIN threads：无对应 thread 时 platform/sessionName/sessionCreatedAt 为 null | Covered | Line 163: `it("returns null for platform/sessionName/sessionCreatedAt when no thread exists")` |
| threads 子查询去重：同一 session_id 有多个 thread 时不导致 token 重复计数 | Covered | Line 173: `it("does not duplicate token counts when multiple threads share the same session_id")` |
| 空数据库返回空数组 | Covered | Line 183: `it("returns an empty array when the database is empty")` |
| since 精确等于 created_at 的记录应被包含（>=） | Covered | Line 188: `it("includes records where created_at equals since")` |
| since 晚于所有记录时返回空数组 | Covered | Line 198: `it("returns an empty array when since is later than all records")` |
| 所有 token 字段为 0 时 COALESCE 返回 0 | Covered | Line 208: `it("returns 0 for all token fields when all values are 0")` |
| 返回值字段名与 OverviewTokenRow 接口一致 | Covered | Line 219: `it("returns objects with all OverviewTokenRow fields")` |
| token 字段类型为 number 非 string | Covered | Line 237: `it("returns token fields as numbers not strings")` |
| 大量数据：多 project 多 session 综合聚合正确 | Covered | Line 248: `it("correctly aggregates across multiple projects with multiple sessions each")` |
| 同一 session 跨多个 project 时分别聚合 | Covered | Line 281: `it("aggregates separately when the same session_id appears under different projects")` |
| threads 子查询 MIN 选择：多 thread 时取 MIN(platform)、MIN(name)、MIN(created_at) | Covered | Line 295: `it("selects MIN(platform), MIN(name), MIN(created_at) when multiple threads exist")` |
| 调用多次结果一致（幂等性） | Covered | Line 306: `it("returns identical results on consecutive calls (idempotent)")` |
| 不修改数据库（无副作用） | Covered | Line 315: `it("does not modify the database (no side effects)")` |
| saveTokenUsage 写入后立即可被 getOverviewTokens 读取 | Covered | Line 326: `it("reads data written by saveTokenUsage immediately")` |
| upsertThread 更新 session_id 后 JOIN 使用新 session_id | Covered | Line 336: `it("joins correctly after upsertThread updates the session_id of a thread")` |

**Checklist coverage: 22/22 (100%)**
**Orphan tests: 0** -- every `it()` block maps to a checklist item.

### 2. False Positive Detection

| # | Pattern | File:Line | Code Snippet | Severity |
|---|---------|-----------|-------------|----------|
| 1 | Weak assertion (not-null instead of value check) | store-tokens.test.ts:158-160 | `expect(rows[0].platform).not.toBeNull()` / `expect(rows[0].sessionName).not.toBeNull()` / `expect(rows[0].sessionCreatedAt).not.toBeNull()` | **Warning** |
| | | | These assertions only verify non-null. They do not verify the *correct* values ("web", "my-session", or the actual timestamp). A bug that returns a wrong but non-null value would pass. Contrast with the MIN test (line 295) which correctly asserts specific values. | |
| 2 | Assertion doesn't fully match test description | store-tokens.test.ts:74-90 | Test title says "returns aggregated token_usage records for all sessions" but only asserts 4 fields for projA and 2 fields for projB. projB's cacheReadTokens and cacheCreationTokens are not verified. | **Warning** |

No instances of: if-guard silent skip, catch swallowing, always-true assertions, weak disjunction, missing assertions, known-bug workaround, or catch-false patterns.

### 3. Unit Test Specific Checks

| # | Check | File:Line | Details | Severity |
|---|-------|-----------|---------|----------|
| 3a | Over-mocking | N/A | No mocking is used. Tests use a real SQLite database. The subject under test (`store.getOverviewTokens`) is never mocked. | **Pass** |
| 3b | Assertion granularity | store-tokens.test.ts:152-161 | The "thread exists" test (line 152) only checks non-null but not the actual values of `platform`, `sessionName`, `sessionCreatedAt`. This is weaker than necessary -- the test sets up known values ("web", "my-session") but does not assert them. | **Warning** |
| 3b | Assertion granularity | store-tokens.test.ts:131-140 | The "sorts by total tokens descending" test only asserts order by sessionId. It does not verify the aggregated token values themselves. Acceptable since aggregation is tested elsewhere, but noted for completeness. | **Pass** |
| 3c | Test isolation | store-tokens.test.ts:61-72 | Each test gets a fresh `Store` instance via `beforeEach` and the DB file is deleted in `afterEach`. `TEST_DB` is a module-level constant (`"test-tokens.db"`) shared with the outer `describe` block (line 5-18), which has its own `beforeEach`/`afterEach` with the same DB path. If tests from both describe blocks run in parallel, they would conflict on the same file. However, Vitest runs tests within a file sequentially by default, so this is not an immediate issue. | **Warning** |
| 3c | Test isolation (duplicate DB path) | store-tokens.test.ts:5,64 | The outer `describe("Store token_usage")` and inner `describe("getOverviewTokens")` both use `TEST_DB = "test-tokens.db"` and both have their own `beforeEach`/`afterEach` lifecycle creating/destroying the same database. The inner describe's `afterEach` cleanup at line 67-72 is a copy of the outer's at line 14-19. This duplication is a maintenance risk but not a functional issue given sequential execution. | **Warning** |

### 4. Quality Score

**Result: Warning**

**Summary:**
- All 22 checklist items are covered with matching `it()` blocks.
- No deadly false-positive patterns detected (no if-guards, catch swallowing, always-true, weak disjunction, missing assertions, or catch-false).
- No over-mocking -- tests use a real database, which is appropriate for a data-access method.
- 2 warnings on assertion granularity: the "thread exists" test (line 152) checks only non-null rather than expected values, and the "since=null" test (line 74) does not fully verify projB's cache fields.
- 1 warning on shared `TEST_DB` path between the outer and inner describe blocks, creating a minor maintenance/isolation risk.

**Recommended actions (non-blocking):**
1. In the "thread exists" test (line 152), replace `.not.toBeNull()` assertions with specific value checks: `expect(rows[0].platform).toBe("web")`, `expect(rows[0].sessionName).toBe("my-session")`.
2. In the "since=null aggregation" test (line 74), add assertions for `projB.cacheReadTokens` and `projB.cacheCreationTokens` to match the completeness of projA's assertions.
3. Consider extracting `TEST_DB` into a unique path per describe block (e.g., `test-tokens-overview.db`) to eliminate any future risk of parallel execution conflicts.
