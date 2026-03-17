# E2E Test Cases: Token Stats UI Optimization

## 1. Test Environment

| Item | Detail |
|------|--------|
| Framework | Playwright |
| Test Runner | `@playwright/test` |
| Fixtures | `test/e2e/fixtures.ts` provides `page` (Playwright Page) and `server` (`{ baseUrl, screenshot }`) |
| Target URL | `{baseUrl}` (navigate via Stats nav button) |
| API Endpoint | `GET /api/stats/overview?window=24h\|7d\|all` |
| Component Under Test | `packages/ui/src/lib/Stats.svelte` |
| Screenshot Helper | `server.screenshot(page, name)` saves to `e2e-screenshots/` |
| Note | All 3 old spec files (`stats-display`, `stats-extended`, `stats-missing`) are OUTDATED and will be REPLACED. Old UI elements (project selector, bar chart, daily table, 4 cards) no longer exist. |

## 2. Module Overview

| Module | Scope | Key Selectors |
|--------|-------|----------------|
| M1 - Window Tabs | Time window tab bar | `.window-tabs`, `.tab-btn`, `.tab-btn.active` |
| M2 - Summary Cards | Aggregate token counters | `.summary-cards`, `.card`, `.card.primary`, `.card.secondary`, `.card-value`, `.card-value-sm`, `.card-sub`, `.card-label` |
| M3 - Project Accordion | Per-project collapsible cards | `.project-card`, `.project-header`, `.collapse-icon`, `.project-name`, `.project-summary` |
| M4 - Session Table | Per-project session detail table | `.session-table`, `thead th`, `tbody tr`, `.col-platform`, `.col-session`, `.col-time`, `.col-num` |
| M5 - Empty / Loading / Error | State indicators | `.loading-text`, `.empty-hint`, `.error-msg` |

## 3. E2E Test Case Table

### M1 - Window Tabs

| # | Module | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot | Priority | Covered |
|---|--------|--------------|----------------|-----------|---------------|-------|-----------------|------------|----------|---------|
| 1 | M1 | User sees time window options | tabs-render-three-buttons | UI | Stats page loaded | 1. Navigate to Stats page | `.window-tabs` visible with exactly 3 `.tab-btn` elements; labels are "最近 24h", "最近 7天", "全部" | tabs-render | P0 | N |
| 2 | M1 | Default tab is 24h | tabs-default-active-24h | UI | Stats page loaded | 1. Navigate to Stats page | First `.tab-btn` has class `.active`; text is "最近 24h" | tabs-default | P0 | N |
| 3 | M1 | User switches to 7d tab | tabs-switch-to-7d | UX | Stats page loaded, 24h active | 1. Click "最近 7天" tab | "最近 7天" button gets `.active` class; "最近 24h" loses `.active` | tabs-switch-7d | P0 | N |
| 4 | M1 | User switches to all tab | tabs-switch-to-all | UX | Stats page loaded | 1. Click "全部" tab | "全部" button gets `.active` class; others lose `.active` | tabs-switch-all | P1 | N |
| 5 | M1 | Tab switch triggers API call | tabs-switch-triggers-fetch | Real-time | Stats page loaded with data | 1. Intercept `/api/stats/overview` requests 2. Click "最近 7天" tab | New request sent with `?window=7d`; response data renders | tabs-api-call | P0 | N |
| 6 | M1 | Rapid tab switching does not corrupt display | tabs-rapid-switch-no-corruption | UX | Stats page loaded | 1. Click "最近 7天" 2. Immediately click "全部" 3. Wait for data | Final display matches "全部" window data; no stale data from 7d | tabs-rapid | P1 | N |

### M2 - Summary Cards

| # | Module | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot | Priority | Covered |
|---|--------|--------------|----------------|-----------|---------------|-------|-----------------|------------|----------|---------|
| 7 | M2 | Summary cards render with data | cards-render-three-cards | UI | API returns data for 24h | 1. Navigate to Stats page 2. Wait for data | `.summary-cards` contains exactly 3 `.card` elements; 2 have `.primary`, 1 has `.secondary` | cards-render | P0 | N |
| 8 | M2 | Input card shows correct label and value | cards-input-label-value | UI | API returns data | 1. Navigate to Stats page | First `.card.primary` has `.card-label` = "Input Tokens", `.card-value` shows formatted number, `.card-sub` shows full number | cards-input | P0 | N |
| 9 | M2 | Output card shows correct label and value | cards-output-label-value | UI | API returns data | 1. Navigate to Stats page | Second `.card.primary` has `.card-label` = "Output Tokens" with `.card-value` and `.card-sub` | cards-output | P0 | N |
| 10 | M2 | Cache card shows read/create split | cards-cache-read-create | UI | API returns data | 1. Navigate to Stats page | `.card.secondary` has `.card-label` = "Cache (read / create)", `.card-value-sm` shows "X / Y" format | cards-cache | P1 | N |
| 11 | M2 | Card values match API response | cards-values-match-api | Data Accuracy | API returns known data | 1. Fetch `/api/stats/overview?window=24h` via API 2. Navigate to Stats page 3. Compare `.card-value` and `.card-sub` text against API `total.input`, `total.output`, `total.cacheRead`, `total.cacheCreation` | `.card-sub` full numbers match API exactly; `.card-value` shows correct `fmt()` abbreviation (e.g., 12345 -> "12.3K") | cards-api-match | P0 | N |
| 12 | M2 | Cards update when tab switches | cards-update-on-tab-switch | Real-time | Stats page loaded, data differs across windows | 1. Note card values on 24h 2. Click "全部" tab 3. Wait for load | Card values update to reflect "all" window totals | cards-tab-update | P0 | N |
| 13 | M2 | Number formatting: K suffix | cards-format-thousands | Data Accuracy | API returns input >= 1000 and < 1_000_000 | 1. Navigate to Stats | `.card-value` shows "X.YK" format (e.g., "12.3K") | cards-fmt-k | P1 | N |
| 14 | M2 | Number formatting: M suffix | cards-format-millions | Data Accuracy | API returns input >= 1_000_000 | 1. Navigate to Stats | `.card-value` shows "X.YM" format (e.g., "1.2M") | cards-fmt-m | P2 | N |
| 15 | M2 | Number formatting: small number no suffix | cards-format-small | Data Accuracy | API returns input < 1000 | 1. Navigate to Stats | `.card-value` shows plain number (e.g., "456") | cards-fmt-small | P2 | N |
| 16 | M2 | No NaN/undefined/null in card values | cards-no-invalid-values | Data Accuracy | Any state | 1. Navigate to Stats | `.summary-cards` innerText does not contain "NaN", "undefined", or "null" | cards-valid | P0 | N |

### M3 - Project Accordion

| # | Module | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot | Priority | Covered |
|---|--------|--------------|----------------|-----------|---------------|-------|-----------------|------------|----------|---------|
| 17 | M3 | Project cards render for each project | projects-render-list | UI | API returns 2+ projects | 1. Navigate to Stats | Number of `.project-card` elements equals number of projects in API response | projects-list | P0 | N |
| 18 | M3 | Project card shows name and summary | projects-name-summary | UI | API returns project data | 1. Navigate to Stats | Each `.project-header` contains `.project-name` (project name) and `.project-summary` with "in: X / out: Y" | projects-info | P0 | N |
| 19 | M3 | Projects default to collapsed | projects-default-collapsed | UI | API returns projects | 1. Navigate to Stats | All `.collapse-icon` show "▶"; no `.session-table` visible | projects-collapsed | P0 | N |
| 20 | M3 | Click project header expands it | projects-expand-on-click | UX | Stats loaded with projects | 1. Click first `.project-header` | Clicked project's `.collapse-icon` changes to "▼"; `.session-table` becomes visible inside that `.project-card` | projects-expand | P0 | N |
| 21 | M3 | Click expanded project header collapses it | projects-collapse-on-click | UX | One project expanded | 1. Click same `.project-header` again | `.collapse-icon` reverts to "▶"; `.session-table` hidden | projects-collapse | P0 | N |
| 22 | M3 | Multiple projects can be expanded simultaneously | projects-multi-expand | UX | 2+ projects exist | 1. Click first project header 2. Click second project header | Both projects show "▼" icon and visible `.session-table` | projects-multi | P1 | N |
| 23 | M3 | Project summary values match API per-project totals | projects-summary-matches-api | Data Accuracy | API returns known per-project data | 1. Fetch API 2. Compare `.project-summary` text against `fmt(proj.total.input)` / `fmt(proj.total.output)` | Summary text matches formatted API values | projects-accuracy | P1 | N |
| 24 | M3 | Tab switch resets expanded state and reloads projects | projects-tab-switch-reloads | Real-time | Project A expanded, 24h active | 1. Click "全部" tab 2. Wait for load | Projects re-render from new API data; previously expanded project is collapsed (expand state resets because `data` is set to `null` during load) | projects-tab-reset | P1 | N |

### M4 - Session Table

| # | Module | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot | Priority | Covered |
|---|--------|--------------|----------------|-----------|---------------|-------|-----------------|------------|----------|---------|
| 25 | M4 | Session table has correct columns | session-table-columns | UI | Project expanded | 1. Expand a project | `.session-table thead th` contains 5 columns: "Platform", "Session", "Time", "In", "Out" | session-columns | P0 | N |
| 26 | M4 | Session rows render for each session | session-table-rows | UI | Project with 2+ sessions expanded | 1. Expand project | `tbody tr` count matches number of sessions in API for that project | session-rows | P0 | N |
| 27 | M4 | Platform column shows icon and name | session-platform-display | UI | Project expanded | 1. Check `.col-platform` cells | Each cell shows platform icon + platform name (e.g., "🟢 web", "🟣 discord", "🔵 lark"); null platform shows "⚪ unknown" | session-platform | P1 | N |
| 28 | M4 | Session column shows name or truncated ID | session-name-or-id | UI | Project expanded | 1. Check `.col-session` cells | Shows `sess.name` if available, otherwise first 12 chars of `sessionId` | session-name | P1 | N |
| 29 | M4 | Time column shows formatted date | session-time-format | UI | Project expanded, session has `createdAt` | 1. Check `.col-time` cells | Shows "MM-DD HH:MM" format; null `createdAt` shows "—" | session-time | P1 | N |
| 30 | M4 | In/Out columns show formatted token counts | session-token-values | Data Accuracy | Project expanded | 1. Check `.col-num` cells | Values match `fmt(sess.total.input)` and `fmt(sess.total.output)` from API | session-tokens | P1 | N |
| 31 | M4 | Session table values sum to project summary | session-sum-matches-project | Data Accuracy | Project expanded with multiple sessions | 1. Sum all session In values 2. Compare to project summary "in" value | Session-level input/output sums equal project-level totals (from API) | session-sum | P2 | N |

### M5 - Empty / Loading / Error States

| # | Module | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot | Priority | Covered |
|---|--------|--------------|----------------|-----------|---------------|-------|-----------------|------------|----------|---------|
| 32 | M5 | Loading indicator shown during fetch | loading-shown-during-fetch | UX | Stats page loading | 1. Navigate to Stats (optionally throttle network) | `.loading-text` with "Loading statistics..." visible while API is in-flight; disappears when data arrives | loading-indicator | P0 | N |
| 33 | M5 | Loading shown on tab switch | loading-shown-on-tab-switch | UX | Stats loaded | 1. Click a different tab | `.loading-text` appears briefly during re-fetch | loading-tab-switch | P1 | N |
| 34 | M5 | Empty state when no data in window | empty-state-no-data | Functional | API returns `projects: []` for selected window | 1. Switch to a window with no data (or mock API to return empty) | `.empty-hint` visible with text "No token usage data in this time window."; no `.project-card` elements | empty-state | P0 | N |
| 35 | M5 | Empty state shows zero summary cards | empty-cards-show-zero | UI | API returns empty `projects: []`, `total` all zeros | 1. View Stats with no data window | Summary cards render with values "0" in `.card-value` and "0" in `.card-sub` | empty-cards-zero | P1 | N |
| 36 | M5 | API 500 error shows error message | error-api-500 | Error Handling | Mock API to return HTTP 500 | 1. Intercept `/api/stats/overview` -> 500 2. Navigate to Stats | `.error-msg` visible with text containing "Failed to load stats"; no `.summary-cards`; no crash | error-500 | P0 | N |
| 37 | M5 | API network error shows error message | error-network-failure | Error Handling | Mock network failure | 1. Intercept `/api/stats/overview` -> abort 2. Navigate to Stats | `.error-msg` visible; page remains functional (tabs still clickable) | error-network | P1 | N |
| 38 | M5 | Error clears on successful retry | error-clears-on-retry | Error Handling | Previous tab load failed | 1. Mock API failure for 24h 2. Navigate (error shown) 3. Remove mock 4. Click "全部" tab | `.error-msg` disappears; data renders normally | error-retry | P1 | N |
| 39 | M5 | No console errors during normal operation | no-console-errors | Error Handling | Stats page loaded with data | 1. Listen to console errors 2. Navigate Stats, switch tabs, expand/collapse projects | No unexpected JS errors in console (ignore favicon 404) | no-js-errors | P1 | N |

### M6 - State Persistence

| # | Module | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot | Priority | Covered |
|---|--------|--------------|----------------|-----------|---------------|-------|-----------------|------------|----------|---------|
| 40 | M6 | Active tab resets to 24h on page reload | state-tab-resets-on-reload | State Persistence | User on "全部" tab | 1. Click "全部" tab 2. Reload page 3. Navigate to Stats | Active tab is "最近 24h" (default); no persistence (state is `$state` only, not URL/localStorage) | state-tab-reload | P1 | N |
| 41 | M6 | Expanded projects reset on page reload | state-expand-resets-on-reload | State Persistence | Project expanded | 1. Expand a project 2. Reload page 3. Navigate to Stats | All projects collapsed (expandedProjects `Set` is ephemeral) | state-expand-reload | P2 | N |

### M7 - Full Page Integration

| # | Module | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot | Priority | Covered |
|---|--------|--------------|----------------|-----------|---------------|-------|-----------------|------------|----------|---------|
| 42 | M7 | Navigate to Stats page via nav button | navigate-to-stats | Functional | App loaded | 1. Go to baseUrl 2. Click "Stats" nav button | `h1` with "Token Statistics" visible; `.window-tabs` visible | navigate-stats | P0 | N |
| 43 | M7 | Page header always visible | page-header-always-visible | UI | Any state | 1. Navigate to Stats | `h1` "Token Statistics" always visible regardless of loading/error/data state | header-visible | P2 | N |
| 44 | M7 | Tabs always visible | tabs-always-visible | UI | Any state (loading, error, data) | 1. Navigate to Stats in any state | `.window-tabs` always rendered and clickable, even during loading or error | tabs-always | P1 | N |

## 4. User Journeys

### Journey 1: First-time Stats Viewer (P0)
> Covers: #42 -> #1 -> #2 -> #32 -> #7 -> #8 -> #9 -> #10 -> #17 -> #18 -> #19

1. User clicks "Stats" nav button -> page loads with "Token Statistics" heading
2. Three time window tabs visible, "最近 24h" active by default
3. Loading indicator appears briefly
4. Summary cards render: Input (primary), Output (primary), Cache (secondary)
5. Project cards listed below, all collapsed with "▶" icons

### Journey 2: Exploring Time Windows (P0)
> Covers: #3 -> #5 -> #12 -> #32 -> #4

1. User clicks "最近 7天" -> tab becomes active, loading shown
2. Cards update with 7-day aggregated values
3. Project list updates to reflect 7-day data
4. User clicks "全部" -> same update cycle with all-time data

### Journey 3: Drilling into Project Details (P0)
> Covers: #20 -> #25 -> #26 -> #27 -> #28 -> #29 -> #30 -> #21 -> #22

1. User clicks a project header -> expands with "▼" icon
2. Session table appears with 5 columns
3. Each session row shows platform icon, session name/ID, time, In, Out
4. User clicks header again -> collapses
5. User expands two projects simultaneously -> both show tables

### Journey 4: Empty Data Window (P1)
> Covers: #34 -> #35 -> #44

1. User switches to a time window with no data
2. Cards show "0" values
3. Empty hint "No token usage data in this time window." appears
4. Tabs remain clickable for switching to another window

### Journey 5: Error Recovery (P1)
> Covers: #36 -> #38 -> #44

1. API fails (500 or network error) -> error message shown
2. No cards or project data rendered
3. Tabs remain visible and clickable
4. User clicks a different tab -> successful response -> error clears, data renders

### Journey 6: Data Accuracy Verification (P1)
> Covers: #11 -> #23 -> #30 -> #31 -> #16

1. Fetch API response programmatically
2. Navigate to Stats page, compare card values against API totals
3. Expand project, compare session table values against API session data
4. Verify no NaN/undefined/null displayed anywhere

---

**Total: 44 test cases**

| Priority | Count |
|----------|-------|
| P0 | 17 |
| P1 | 20 |
| P2 | 7 |

| Dimension | Count |
|-----------|-------|
| UI | 14 |
| UX | 8 |
| Functional | 3 |
| Real-time | 4 |
| State Persistence | 2 |
| Data Accuracy | 8 |
| Error Handling | 5 |

All 44 cases are marked **Covered = N** (new UI; all old tests are outdated and will be replaced).
