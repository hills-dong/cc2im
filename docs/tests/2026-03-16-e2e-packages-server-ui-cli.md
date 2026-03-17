# E2E Test Case Checklist — cc2im (Web + CLI)

Generated: 2026-03-16
Scope: `packages/server/e2e/` (Web UI), `packages/ui/` (Svelte components), `packages/cli/` (CLI)
Persona: Senior QA Engineer — user-first thinking, destructive creativity, state-aware paranoia, boundary hunting

---

## Test Environment

| Item | Specification |
|------|--------------|
| Orchestration | `docker compose -f docker-compose.e2e.yml up --build` |
| App container | Node.js 18+ with cc2im server, built UI assets, test config |
| Test runner container | `mcr.microsoft.com/playwright:v1.52-noble` with Playwright test specs |
| Database | Fresh SQLite file per run, ephemeral volume (`/tmp/cc2im-e2e.db`) |
| Config | `e2e/fixtures/config.e2e.yaml` (committed to repo, test-only values with mock Claude) |
| Ports | App server: `18081` (HTTP + WS); no conflict with dev server `8080`/`8081` |
| Cleanup | `docker compose -f docker-compose.e2e.yml down -v` after run |
| Run command | `npm run test:e2e:docker` |
| Claude mock | Tests requiring Claude responses use a mock script returning deterministic NDJSON output with known token counts |

---

## Project Type Detection

**Mixed** — Playwright config at `packages/server/playwright.config.ts`, CLI binary at `packages/cli/src/cli.ts`.

---

## Module Overview

### Chat Page

| Route/Command | Description |
|---------------|-------------|
| `/` (default) | Main chat interface — sidebar with project/session list, message thread with streaming responses, token counter, image attachment support |

### Sidebar

| Route/Command | Description |
|---------------|-------------|
| `/` (sidebar region) | Left panel: collapsible project sections, session items (truncated IDs), new-session (+) button, bottom nav (Config/Stats) |

### Config Page

| Route/Command | Description |
|---------------|-------------|
| `/` → Config nav | Configuration form: Claude settings, Discord/Lark tokens, project CRUD, formatter settings |

### Stats Page

| Route/Command | Description |
|---------------|-------------|
| `/` → Stats nav | Token usage: project selector, 4 summary cards (input/output/cache/total), SVG bar chart (last 20 days), daily breakdown table |

### Onboarding

| Route/Command | Description |
|---------------|-------------|
| `/` (first load, no projects) | 5-step wizard: Claude command → test → add project → platform tokens → done |

### CLI: `cc2im` commands

| Route/Command | Description |
|---------------|-------------|
| `cc2im install [--config <path>]` | Write systemd/launchd service file, enable and start |
| `cc2im uninstall` | Stop, disable, remove service |
| `cc2im start / stop / restart` | Service lifecycle |
| `cc2im status` | Print service status |
| `cc2im logs` | Tail live service logs |
| `cc2im web [--port N] [--bind H] [--config <path>]` | Start HTTP/WS server with Web UI |
| `cc2im run` | Foreground bridge mode (default) |
| `cc2im help / -h / --help` | Print usage |
| `cc2im <unknown>` | Error + usage, exit 1 |

---

## Web E2E Test Cases

### Chat Page

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Chat Page | App loads for the first time | Sidebar and main content visible on load | UI | E2E Docker environment running, test config loaded | Navigate to `/` | `.sidebar` and `.main-content` both visible within 5s | Y | P0 | Y |
| Chat Page | User sees connection state | Status bar shows "Connected" | UI | E2E Docker environment running, WS reachable | Navigate to `/` | `.conn-status` contains "Connected" within 5s, green indicator | Y | P0 | Y |
| Chat Page | No project selected | Empty state prompt | UI | E2E Docker environment running, projects configured, no session selected | Navigate to `/` without selecting session | `.empty-state` with "Select a project" message | Y | P0 | Y |
| Chat Page | Markdown in response | Assistant markdown renders correctly | UI | E2E Docker environment running, session started | Ask Claude to respond with bold, code, list | `<strong>`, `<code>`, `<li>` elements in `.content.markdown` | Y | P2 | Y |
| Chat Page | Multi-turn message ordering | Messages in chronological order | UI | E2E Docker environment running, 2+ round-trips | Send 3 messages, wait for each response | 6 messages in order: user1→asst1→user2→asst2→user3→asst3; no duplication | Y | P0 | Y |
| Chat Page | Long conversation scrollable | Scrollbar appears with many messages | UI | E2E Docker environment running, 10+ messages | Send multiple messages | Scrollbar visible; can scroll up to earliest messages | Y | P1 | N |
| Chat Page | XSS prevention in messages | HTML tags in user input are escaped | UI | E2E Docker environment running, session started | Send `<script>alert('xss')</script>` as message | Text displays literally; no script execution; no DOM injection | N | P0 | N |
| Chat Page | New session opens chat UI | Chat area appears after + click | UX | E2E Docker environment running, projects loaded | Click `.new-session-btn` | `.chat-input-area` visible; no-messages hint shown | Y | P0 | Y |
| Chat Page | Empty input state | Placeholder and disabled send | UX | E2E Docker environment running, new session view | Open new session, don't type | Placeholder "Enter to send"; `.send-btn` disabled | N | P1 | Y |
| Chat Page | Typing enables send | Send button enables with text | UX | E2E Docker environment running, session started | Type text into textarea | `.send-btn` enabled | N | P1 | Y |
| Chat Page | Enter sends message | Keyboard shortcut works | UX | E2E Docker environment running, text typed | Press Enter | User bubble appears; input clears | N | P0 | Y |
| Chat Page | Shift+Enter inserts newline | Multi-line input works | UX | E2E Docker environment running, session started | Press Shift+Enter | Newline inserted; message NOT sent; textarea height increases | N | P1 | N |
| Chat Page | Auto-scroll on new messages | Chat scrolls to bottom | UX | E2E Docker environment running, messages overflow viewport | Send message when scrolled to bottom | Auto-scrolls to newest message | N | P1 | Y |
| Chat Page | Send blocked during streaming | Cannot double-send | UX | E2E Docker environment running, assistant streaming | Try to send while cursor animating | Send disabled or abort button shown; second message blocked | N | P1 | Y |
| Chat Page | Abort streaming response | Stop button stops generation | UX | E2E Docker environment running, assistant streaming | Click abort/stop button | Streaming stops; cursor disappears; partial response visible; can send again | N | P1 | N |
| Chat Page | Reconnection after disconnect | Auto-reconnects WebSocket | UX | E2E Docker environment running, previously connected | Simulate WS drop then restore | `.conn-status` returns to "Connected" without page reload | Y | P1 | N |
| Chat Page | Double-click send button | Only one message sent | UX | E2E Docker environment running, text typed | Double-click send button rapidly | Only 1 user bubble appears; not 2 duplicate messages | N | P1 | N |
| Chat Page | Full round-trip: send and stream | User sends, assistant streams, completes | Functional | E2E Docker environment running, Claude mock configured, new session | Type message → Enter → wait for completion | User bubble appears; assistant streams; cursor disappears; content length > 0 | Y | P0 | Y |
| Chat Page | User bubble renders immediately | Sent message visible as bubble | Functional | E2E Docker environment running, session started | Type "hello" → Enter | `.message-wrap.user` with "hello" visible | N | P0 | Y |
| Chat Page | Streaming cursor visible | Cursor animates during response | Functional | E2E Docker environment running, message sent | Observe during streaming | `.cursor` visible in assistant bubble | Y | P1 | Y |
| Chat Page | Streaming completes | Cursor disappears after done | Functional | E2E Docker environment running, message sent | Wait for streaming to finish | `.cursor` hidden; response text in `.content.markdown` | N | P0 | Y |
| Chat Page | No-messages hint | Hint before first message | Functional | E2E Docker environment running, new session | Open new session | `.no-messages` visible | N | P1 | Y |
| Chat Page | Second message in same session | Follow-up after first response | Functional | E2E Docker environment running, first round-trip done | Send second message | Second user+assistant pair appears; previous messages intact | N | P0 | Y |
| Chat Page | Context continuity | Assistant references prior messages | Functional | E2E Docker environment running, first message answered | Send "what did I just say?" | Assistant references content of first message | N | P0 | N |
| Chat Page | Switch session loads its state | Clicking session shows its content | Functional | E2E Docker environment running, 2+ sessions with messages | Click different session in sidebar | Chat displays selected session's messages | Y | P0 | P |
| Chat Page | Session resume sends to same Claude | Follow-up uses existing session ID | Functional | E2E Docker environment running, existing session | Select session → send message | WS `chat.send` includes `sessionId`; response has prior context | N | P0 | N |
| Chat Page | New vs existing session distinction | New blank, existing shows history | Functional | E2E Docker environment running, 1+ existing session | Click "+", then click existing session | New shows empty; existing shows its messages | Y | P1 | N |
| Chat Page | Empty session state | No-message session shows hint | Functional | E2E Docker environment running, session created, no messages | Click empty session | No-messages hint; no stale messages from other session | N | P1 | N |
| Chat Page | User message appears BEFORE server response | Optimistic UI: instant user bubble | Real-time | E2E Docker environment running, Claude mock with 2s+ delay | Type → Enter | User bubble visible within 200ms, BEFORE assistant bubble exists; verify user bubble present while no assistant bubble yet | N | P1 | N |
| Chat Page | Streaming renders progressively | Tokens appear incrementally | Real-time | E2E Docker environment running, Claude mock streams slowly | Send message | Assistant content length increases over multiple checks during streaming; not 0→full in one jump | Y | P0 | N |
| Chat Page | WS messages in correct order | No message reordering | Real-time | E2E Docker environment running, multi-turn | Send 2 messages sequentially | Always user1→asst1→user2→asst2; no interleaving | N | P1 | Y |
| Chat Page | No lag between send and bubble | Input clears, bubble appears instantly | Real-time | E2E Docker environment running, session started | Type → Enter → immediately check | Textarea cleared; user bubble visible; no >300ms empty gap | N | P1 | N |
| Chat Page | Send message then immediately refresh | User action interrupted by refresh | Real-time | E2E Docker environment running, session started | Type → Enter → immediately `page.reload()` within 500ms | After reload: page recovers gracefully; no crash; if message was processed, it appears in history | N | P1 | N |
| Chat Page | Switch session while streaming | User navigates away mid-stream | Real-time | E2E Docker environment running, assistant currently streaming | Click different session while cursor animating | Switched session loads correctly; no orphaned streaming state; returning to original session shows partial or complete response | N | P1 | N |
| Chat Page | History survives page refresh | Messages persist after F5 | State Persistence | E2E Docker environment running, clean test database, 2+ user+assistant messages | Send messages, wait for responses, `page.reload()`, re-select session | All messages displayed in correct order; content matches pre-refresh; no loss or duplication | N | P0 | N |
| Chat Page | Session list survives refresh | Sidebar sessions intact after reload | State Persistence | E2E Docker environment running, 2+ sessions exist | Verify sessions, reload page | Same sessions in sidebar; count unchanged; clicking one loads its messages | N | P0 | N |
| Chat Page | Active session state survives refresh | Selected session re-selectable | State Persistence | E2E Docker environment running, session selected | Select session, reload | Previously selected session can be re-selected and shows correct history | N | P1 | N |
| Chat Page | WS reconnection preserves state | Messages intact after reconnect | State Persistence | E2E Docker environment running, session with messages | Simulate WS disconnect → reconnect | Previous messages still visible; no duplicates; can send new messages | N | P1 | N |
| Chat Page | Navigate away and back preserves chat | Config→Chat round-trip | State Persistence | E2E Docker environment running, session with messages | Send message → Config nav → Chat nav | Previous messages visible; same session active | N | P1 | N |
| Chat Page | History across browser sessions | Data survives browser close/open | State Persistence | E2E Docker environment running, session with messages | Close browser context, open new, navigate to app | Previous sessions in sidebar; clicking one shows full history | N | P0 | N |
| Chat Page | Markdown in loaded history | Historical markdown renders correctly | State Persistence | E2E Docker environment running, session with markdown responses | Reload page, select session | Markdown formatted; code blocks highlighted; not raw text | Y | P1 | N |
| Chat Page | Unsent text survives session switch | Typed text preserved during navigation | State Persistence | E2E Docker environment running, 2 sessions available | Type text (don't send) → switch session → switch back | Typed text still in textarea | N | P2 | N |
| Chat Page | Token stats non-zero after conversation | Token counter shows actual usage | Data Accuracy | E2E Docker environment running, clean test database, Claude mock with known token counts | Send message, wait for complete response | Token display: input > 0, output > 0; NOT `0/0` or blank | N | P0 | N |
| Chat Page | Token stats match server values | UI tokens equal WS event values | Data Accuracy | E2E Docker environment running, Claude mock with deterministic tokens | Send message, intercept `chat.done` WS event | Displayed tokens match `inputTokens`/`outputTokens` from `chat.done` | N | P0 | N |
| Chat Page | Token stats accumulate across turns | Cumulative count increases per turn | Data Accuracy | E2E Docker environment running, 2+ completed round-trips | Send 3 messages, record tokens after each | Counts increase monotonically; final > first; no reset | N | P1 | N |
| Chat Page | Token stats survive page refresh | Token counts not lost on reload | Data Accuracy | E2E Docker environment running, session with non-zero tokens | Record values, reload, re-select session | Token values match pre-refresh; NOT reset to `0/0` | N | P1 | N |
| Chat Page | Message content exact after reload | Loaded messages match originals | Data Accuracy | E2E Docker environment running, specific message content | Send unique text, reload, select session | Text exactly matches; no truncation or encoding corruption | N | P0 | N |
| Chat Page | WS error on unknown project | Error for unregistered project | Error Handling | E2E Docker environment running, WS connected | Send `chat.send` with `project: "nonexistent"` | `chat.error` with code `PROJECT_NOT_FOUND` | N | P0 | Y |
| Chat Page | Network failure during streaming | Graceful degradation mid-stream | Error Handling | E2E Docker environment running, message sent | Kill network while streaming | Error shown; no crash; cursor disappears | Y | P1 | N |
| Chat Page | Empty message blocked | Cannot send blank input | Error Handling | E2E Docker environment running, new session | Click send without typing; press Enter with empty input; type whitespace only | No user bubble; no WS message sent | N | P1 | Y |
| Chat Page | Very long message handling | Oversized input doesn't crash | Error Handling | E2E Docker environment running, session started | Paste 50000+ character message, send | Message either sends successfully or shows clear size limit error; no crash or hang | N | P1 | N |
| Chat Page | Rapid successive sends after streaming | Immediate re-send after response | Error Handling | E2E Docker environment running, first response complete | Send second message within 100ms of cursor disappearing | Second message sends normally; no race condition; messages appear in order | N | P1 | N |
| Chat Page | Image attachment drag and drop | User attaches image to message | Functional | E2E Docker environment running, session started | Drag image file onto chat input area | Image preview appears; can remove; send with image attached | Y | P1 | N |
| Chat Page | Image paste from clipboard | User pastes screenshot | Functional | E2E Docker environment running, session started | Paste image from clipboard into textarea | Image preview appears below textarea; included in send payload | Y | P1 | N |
| Chat Page | Two browser tabs simultaneous | Concurrent usage from multiple tabs | State Persistence | E2E Docker environment running | Open app in 2 tabs; send message from tab 1 | Tab 2 receives streaming response via WS broadcast; both tabs show consistent state | N | P1 | N |

### Sidebar

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Sidebar | Projects loaded | Project sections rendered | UI | E2E Docker environment running, test config with 1+ project | Navigate to `/` | `.sidebar-loading` hidden; 1+ `.project-section` visible | Y | P0 | Y |
| Sidebar | Sessions listed | Session items with truncated IDs | UI | E2E Docker environment running, 1+ session exists | Navigate to `/` | `.session-item` visible; text length 1-8 chars | N | P1 | Y |
| Sidebar | Chat nav button visible | Chat button rendered | UI | E2E Docker environment running | Observe nav area | Chat nav button visible | Y | P1 | Y |
| Sidebar | Loading state clears | Spinner disappears | UX | E2E Docker environment running | Navigate to `/` | `.sidebar-loading` hidden within 5s | N | P0 | Y |
| Sidebar | Session selection | Click activates session | UX | E2E Docker environment running, 1+ session | Click `.session-item` | Clicked item has `active` class; main content updates | Y | P0 | Y |
| Sidebar | New session button | + creates new session | UX | E2E Docker environment running, projects loaded | Click `.new-session-btn` | `textarea.message-input` visible | N | P0 | Y |
| Sidebar | Project collapse/expand | Toggle project section | UX | E2E Docker environment running, project with sessions | Click project header to collapse, then expand | Sessions hide on collapse, reappear on expand; selection state preserved | N | P1 | N |
| Sidebar | Config navigation | Config button works | Functional | E2E Docker environment running | Click Config nav | `.config-page` visible | N | P0 | Y |
| Sidebar | Stats navigation | Stats button works | Functional | E2E Docker environment running | Click Stats nav | `h1:has-text('Token Statistics')` visible | N | P0 | Y |
| Sidebar | New session appears after first message | Session created in sidebar | Functional | E2E Docker environment running, new session, no prior sessions for project | Click +, send message, wait for response | New `.session-item` appears in sidebar under the project | N | P0 | N |
| Sidebar | Sessions persist after refresh | Sessions survive reload | State Persistence | E2E Docker environment running, sessions in DB | Verify sessions, reload | Same sessions visible; count unchanged | N | P0 | N |
| Sidebar | Projects persist after refresh | Projects survive reload | State Persistence | E2E Docker environment running, test config loaded | Verify projects, reload | Same project sections visible | N | P0 | N |
| Sidebar | Many sessions performance | Sidebar renders 20+ sessions | State Persistence | E2E Docker environment running, 20+ sessions for a project in DB | Navigate to `/` | All sessions rendered; scrollable; no truncation or crash | N | P1 | N |
| Sidebar | No JS errors on load | Console clean | Error Handling | E2E Docker environment running | Navigate to `/`, collect `pageerror` events for 3s | Empty errors array | N | P0 | Y |
| Sidebar | API failure for projects | Graceful degradation | Error Handling | E2E Docker environment running, mock `/api/projects` to return 500 | Navigate to `/` | No crash; error or empty state shown | Y | P1 | N |
| Sidebar | Empty project list | Clean empty state | Error Handling | E2E Docker environment running, config with no projects | Navigate to `/` | Onboarding shown or sidebar empty state; no crash | Y | P1 | N |

### Config Page

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Config Page | Page loads | Form sections rendered | UI | E2E Docker environment running, test config loaded | Click Config nav, wait for load | `.config-page` visible; 3+ `.config-section`; h1 "Configuration" | Y | P0 | Y |
| Config Page | All 5 sections present | Complete layout | UI | E2E Docker environment running | Navigate to Config | Claude, Discord, Lark, Projects, Formatter sections visible | Y | P2 | Y |
| Config Page | Token masking | Discord token is password field | UI | E2E Docker environment running, config with discord token | Navigate to Config | `#discord-token` has `type="password"` | N | P1 | Y |
| Config Page | Loading transition | Spinner to form | UX | E2E Docker environment running | Navigate to Config | `.loading` visible then hidden; form appears | N | P1 | Y |
| Config Page | Config API shape | Correct response structure | Functional | E2E Docker environment running | `GET /api/config` | Has `claude`, `projects`, `formatter`; `discord.token === "***"` | N | P0 | Y |
| Config Page | Save config | Edit and persist | Functional | E2E Docker environment running, config loaded | Change Claude command → Save | Toast success; change persisted on reload | Y | P0 | Y |
| Config Page | Add project | Create new project | Functional | E2E Docker environment running, config loaded | Click "+ Add Project" → fill name+dir → Add | New project card appears; toast confirmation | Y | P0 | Y |
| Config Page | Delete project | Remove project | Functional | E2E Docker environment running, 1+ project | Click Delete on project → confirm | Card removed; toast confirmation | Y | P0 | Y |
| Config Page | Formatter numeric inputs | Accept valid numbers | Functional | E2E Docker environment running, config loaded | Set Discord max length to 1800 → save | Value persisted; API returns correct value | N | P2 | N |
| Config Page | Save then reload verifies persistence | Config really saved to disk | State Persistence | E2E Docker environment running | Change value, save, reload page | Changed value still in form | N | P0 | N |
| Config Page | Added project persists | New project survives reload | State Persistence | E2E Docker environment running | Add project, reload | Project still in list | N | P0 | N |
| Config Page | Deleted project stays deleted | Deletion persists | State Persistence | E2E Docker environment running | Delete project, reload | Project NOT in list; project NOT in sidebar | N | P0 | N |
| Config Page | Config values match API | Displayed = server state | Data Accuracy | E2E Docker environment running | Load config, compare with `GET /api/config` | All field values match API response exactly | N | P1 | N |
| Config Page | Delete project with active sessions | Orphaned sessions handled | Data Accuracy | E2E Docker environment running, project with existing sessions | Delete the project | Project removed; sessions for that project no longer appear; no crash or ghost sessions | N | P1 | N |
| Config Page | Empty fields rejected | Add project validation | Error Handling | E2E Docker environment running, add form open | Click Add with empty name/directory | Toast error; no empty project created | N | P1 | Y |
| Config Page | Save failure | API error on save | Error Handling | E2E Docker environment running, mock PUT to return 500 | Edit → Save | Toast error; page doesn't crash; form still usable | N | P1 | N |
| Config Page | Navigate away with unsaved changes | User might lose edits | Error Handling | E2E Docker environment running, config loaded | Edit field (don't save) → click Chat nav → click Config nav | Either: warning before leave, or form reloads from server (no silent data loss) | N | P1 | N |
| Config Page | Duplicate project name | Uniqueness enforced | Error Handling | E2E Docker environment running, project "test" exists | Try to add another project named "test" | Error toast or rejection; no duplicate created | N | P1 | N |

### Stats Page

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Stats Page | Page loads | H1 and layout rendered | UI | E2E Docker environment running | Click Stats nav | `h1:has-text('Token Statistics')` visible | Y | P0 | Y |
| Stats Page | Bar chart renders | SVG chart with bars | UI | E2E Docker environment running, project with token data in test DB | Select project with data | `.bar-chart` SVG visible with bars and date labels | Y | P1 | P |
| Stats Page | Daily table renders | Table with rows | UI | E2E Docker environment running, project with daily data in test DB | Select project | `.table-section table` visible with data rows | Y | P1 | P |
| Stats Page | No selection hint | Placeholder before selection | UX | E2E Docker environment running | Navigate to Stats, don't select | `.empty-hint` with "Select a project" | N | P1 | Y |
| Stats Page | Loading states | Loading text during fetch | UX | E2E Docker environment running | Select project, observe | Brief loading text before cards appear | N | P2 | N |
| Stats Page | Project selector populated | Dropdown has projects | Functional | E2E Docker environment running, 1+ project | Navigate to Stats | `#project-select` with 2+ options (placeholder + projects) | N | P0 | Y |
| Stats Page | Project selection loads cards | 4 summary cards appear | Functional | E2E Docker environment running | Select project | `.summary-cards .card` visible; exactly 4 cards | Y | P0 | Y |
| Stats Page | Stats API shape | Correct response structure | Functional | E2E Docker environment running, project with data | `GET /api/stats/tokens?project=<name>` | Has `totalInput`, `totalOutput`, `totalCache`, `daily` (array) | N | P0 | Y |
| Stats Page | Switch projects updates display | Stats refresh on project change | Functional | E2E Docker environment running, 2+ projects | Select project A, then B | Cards update to project B values; chart/table updates | N | P1 | P |
| Stats Page | Stats persist after refresh | Stats data survives reload | State Persistence | E2E Docker environment running, project selected | Record values, reload, re-select project | Same values displayed | N | P0 | N |
| Stats Page | Summary cards match API exactly | Displayed totals = API response | Data Accuracy | E2E Docker environment running, project with known token data | Select project, fetch API, compare | Card values match `totalInput`, `totalOutput`, `totalCache` exactly | N | P0 | N |
| Stats Page | Daily table matches API | Rows match API daily array | Data Accuracy | E2E Docker environment running, project with multi-day data | Select project, compare table with API `daily` | Each row matches date, tokens from API | N | P1 | N |
| Stats Page | Non-zero values for used projects | Real data shown, not zeros | Data Accuracy | E2E Docker environment running, project with 1+ completed conversation in test DB | Select project | Summary cards > 0 for input/output; daily table has non-zero rows | N | P0 | N |
| Stats Page | Stats update after new conversation | Fresh data reflected | Data Accuracy | E2E Docker environment running, send message in Chat, then check Stats | Send message → wait → navigate to Stats → select project | Token counts include the conversation just completed; values increased | N | P0 | N |
| Stats Page | Bar chart proportions accurate | Bars proportional to values | Data Accuracy | E2E Docker environment running, project with varying daily data | Select project | Taller bars for higher-usage days; proportional sizing | Y | P2 | N |
| Stats Page | Token formatting correct | K/M abbreviations accurate | Data Accuracy | E2E Docker environment running, project with >1000 tokens | Select project | Values like "1.5K" or "2.3M" match actual numbers; no rounding errors | N | P1 | N |
| Stats Page | No data for project | Empty hint shown | Error Handling | E2E Docker environment running, project with zero usage | Select zero-usage project | `.empty-hint` shown; no JS error; no crash | N | P1 | P |
| Stats Page | API failure | Error displayed | Error Handling | E2E Docker environment running, mock stats API to return 500 | Select project | `.error-msg` shown; page doesn't crash | N | P1 | N |
| Stats Page | Nonexistent project via API | Graceful zero response | Error Handling | E2E Docker environment running | `GET /api/stats/tokens?project=doesnotexist` | Returns totalInput=0, totalOutput=0, daily=[] | N | P1 | Y |

### Onboarding

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Onboarding | No projects triggers onboarding | Overlay shown on empty config | Functional | E2E Docker environment running, clean test database, no projects | Navigate to `/` | `.overlay` visible with wizard | Y | P0 | Y |
| Onboarding | Projects exist skips onboarding | No overlay when configured | Functional | E2E Docker environment running, 1+ project in config | Navigate to `/` | `.overlay` NOT visible | N | P0 | Y |
| Onboarding | Step 1: Claude command | Input accepts path | UX | E2E Docker environment running, onboarding visible | Type command path | Next button enabled | N | P0 | N |
| Onboarding | Step 1 validation | Empty command blocked | Error Handling | E2E Docker environment running, step 1 | Leave empty, try Next | Button disabled; cannot advance | N | P1 | N |
| Onboarding | Step 2: Test passes | Verification succeeds | Functional | E2E Docker environment running, step 2, valid mock command | Click Test | Spinner → success status | Y | P0 | N |
| Onboarding | Step 2: Test fails | Invalid command shows error | Error Handling | E2E Docker environment running, step 2, invalid command | Click Test | Error message; cannot proceed | N | P1 | N |
| Onboarding | Step 3: Project details | Name and directory fields | Functional | E2E Docker environment running, step 3 | Fill name + directory | Can proceed to step 4 | N | P0 | N |
| Onboarding | Step 3 validation | Empty fields blocked | Error Handling | E2E Docker environment running, step 3 | Leave fields empty | Cannot advance | N | P1 | N |
| Onboarding | Step 4: Platform tokens optional | Can skip tokens | UX | E2E Docker environment running, step 4 | Skip without entering tokens | Proceeds to step 5 | N | P2 | N |
| Onboarding | Step 5: Complete wizard | Finish transitions to chat | Functional | E2E Docker environment running, all steps done | Click Finish | Overlay gone; Chat page; project in sidebar | Y | P0 | N |
| Onboarding | Back button works | Navigate backwards | UX | E2E Docker environment running, step 3 | Click Back twice | Returns to step 1 with previous values preserved | N | P1 | N |
| Onboarding | Completed state persists | Onboarding doesn't reappear | State Persistence | E2E Docker environment running | Complete onboarding, reload | Overlay NOT visible; project still in sidebar | N | P0 | N |
| Onboarding | Refresh mid-wizard | Interrupted onboarding | State Persistence | E2E Docker environment running, step 3 (mid-wizard) | Reload page | Either resumes wizard or restarts from step 1; no crash; no half-configured state | N | P1 | N |

---

## CLI E2E Test Cases

### `cc2im help / -h / --help`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: help | User requests help | `--help` prints usage | Output Validation | cc2im built in Docker | Run `cc2im --help` | stdout lists all commands; exit 0 | N | P0 | N |
| CLI: help | Short flag | `-h` equals `--help` | Input Validation | cc2im built in Docker | Run `cc2im -h` | Same output as `--help`; exit 0 | N | P1 | N |
| CLI: help | Bare help | `cc2im help` works | Input Validation | cc2im built in Docker | Run `cc2im help` | Same output; exit 0 | N | P2 | N |

### `cc2im <unknown>`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: unknown | Typo in command | Unknown command error | Error Handling | cc2im built in Docker | Run `cc2im badcmd` | stderr "Unknown command: badcmd"; usage; exit 1 | N | P0 | N |
| CLI: unknown | No args default | Bare `cc2im` runs bridge | Input Validation | cc2im built in Docker, test config | Run `cc2im` | Starts bridge; stdout "cc2im starting..." | N | P1 | N |

### `cc2im install`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: install | Happy path | Service installed and running | Side Effect Validation | cc2im built in Docker, valid test config | Run `cc2im install` | Service file written; stdout confirmation; service running | N | P0 | N |
| CLI: install | Custom config | `--config` respected | Input Validation | cc2im built in Docker, config at custom path | `cc2im install --config /tmp/test.yaml` | Service references custom config path | N | P0 | N |
| CLI: install | Config missing | Error on missing config | Error Handling | cc2im built in Docker, no config | `cc2im install` without config | stderr "Config not found"; exit 1; no service file | N | P0 | N |
| CLI: install | No adapters | Exits cleanly, no restart loop | Error Handling | cc2im built in Docker, config with no tokens | `cc2im install`, observe behavior | Service exits with adapter error; does NOT restart infinitely | N | P0 | N |
| CLI: install | Already installed | Re-install behavior | Error Handling | cc2im built in Docker, service already installed | Run `cc2im install` again | Either updates service file or shows "already installed"; no crash | N | P1 | N |

### `cc2im uninstall`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: uninstall | Happy path | Service removed | Side Effect Validation | cc2im built in Docker, service installed | Run `cc2im uninstall` | File deleted; service stopped; stdout confirmation | N | P0 | N |
| CLI: uninstall | Not installed | Graceful no-op | Error Handling | cc2im built in Docker, no service | Run `cc2im uninstall` | stdout "not installed"; exit 0 | N | P1 | N |

### `cc2im start / stop / restart`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: start | Start service | Service becomes active | Output Validation | cc2im built in Docker, service installed, stopped | `cc2im start` | stdout confirmation; service active | N | P0 | N |
| CLI: start | Not installed | Error reported | Error Handling | cc2im built in Docker, no service | `cc2im start` | Error message; non-zero exit | N | P1 | N |
| CLI: stop | Stop service | Service stops | Output Validation | cc2im built in Docker, service running | `cc2im stop` | stdout confirmation; service inactive | N | P0 | N |
| CLI: restart | Restart service | Service restarts | Output Validation | cc2im built in Docker, service running | `cc2im restart` | stdout confirmation; service active after restart | N | P0 | N |

### `cc2im status`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: status | Running service | Shows active | Output Validation | cc2im built in Docker, service running | `cc2im status` | Output shows active; exit 0 | N | P0 | N |
| CLI: status | Stopped service | Shows inactive | Output Validation | cc2im built in Docker, service stopped | `cc2im status` | Output shows inactive; exit 0 | N | P1 | N |

### `cc2im logs`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: logs | Tail logs (Linux) | journalctl starts | Output Validation | cc2im built in Docker (Linux), service running | `cc2im logs` | Spawns journalctl without error | N | P1 | N |

### `cc2im web`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: web | Default port | Server on 8080 | Output Validation | cc2im built in Docker, test config | `cc2im web` | stdout shows URL at 8080; GET `/` returns 200 | N | P0 | N |
| CLI: web | Custom port | `--port` works | Input Validation | cc2im built in Docker | `cc2im web --port 9090` | URL shows 9090; GET at 9090 returns 200 | N | P0 | N |
| CLI: web | Custom bind | `--bind` works | Input Validation | cc2im built in Docker | `cc2im web --bind 127.0.0.1` | Bound to loopback only | N | P1 | N |
| CLI: web | Custom config | `--config` works | Side Effect Validation | cc2im built in Docker, config at custom path | `cc2im web --config /tmp/test.yaml` | Server uses specified config; projects match | N | P1 | N |
| CLI: web | Invalid port | Error on bad port | Error Handling | cc2im built in Docker | `cc2im web --port abc` | Error; server doesn't start | N | P1 | N |

### `cc2im run`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: run | Happy path | Bridge starts foreground | Output Validation | cc2im built in Docker, valid config, Discord token | `cc2im run` | stdout "starting..." then "ready."; process stays alive | N | P0 | N |
| CLI: run | No adapters | Exits with error | Error Handling | cc2im built in Docker, no tokens in config | `cc2im run` | Exits with adapter error; NOT infinite restart | N | P0 | N |
| CLI: run | SIGTERM shutdown | Clean exit | Side Effect Validation | cc2im built in Docker, bridge running | Send SIGTERM | Shutdown message; exit 0; no pending-restart residue | N | P1 | N |
| CLI: run | SIGINT shutdown | Ctrl+C clean exit | Side Effect Validation | cc2im built in Docker, bridge running | Send SIGINT | Exit 0; adapters stopped | N | P1 | N |
| CLI: run | Pending restart recovery | Resumes crashed threads | Side Effect Validation | cc2im built in Docker, DB has pending-restart records | `cc2im run` | Logs "Recovering N pending restart(s)"; records cleared | N | P1 | N |

---

## User Journeys

Journey dependency graph:

```
J0: Install & First-time Setup (base)
├── J1: First Conversation (depends on J0)
│   ├── J3: Multi-turn & History Persistence (depends on J1)
│   │   └── J5: Returning User (depends on J3)
│   └── J4: Token Stats Verification (depends on J1)
├── J2: Configuration Change (depends on J0)
└── J6: Error Recovery (depends on J0)
```

### Journey J0: Install & First-time Setup (Base)

**Goal:** New user starts the server and completes first-time setup via Web UI onboarding
**Priority:** P0
**Depends on:** None (base journey)
**Covered:** N

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | CLI: web | Run `cc2im web --config e2e/fixtures/config-empty.e2e.yaml` in Docker | stdout "cc2im web UI available at http://..."; GET `/` returns 200 |
| 2 | Web: Browser | Navigate to `http://app:18081/` | Page loads; sidebar and main-content visible |
| 3 | Web: Connection | WebSocket connects | `.conn-status` shows "Connected" |
| 4 | Web: Onboarding | Onboarding overlay appears (no projects) | `.overlay` visible with step 1 |
| 5 | Web: Onboarding | Enter Claude command path → Next | Step 2 active |
| 6 | Web: Onboarding | Click Test | Test passes; success shown; step 3 active |
| 7 | Web: Onboarding | Enter project "e2e-project", dir "/tmp/e2e" → Next | Step 4 active |
| 8 | Web: Onboarding | Skip platform tokens → Next | Step 5 active |
| 9 | Web: Onboarding | Click Finish | Overlay gone; Chat page shown |
| 10 | Web: Sidebar | Verify project in sidebar | `.project-section` with "e2e-project" |
| 11 | Web: Sidebar | Click new session (+) | Chat input area visible; send button disabled |

### Journey J1: First Conversation

**Goal:** User sends their first message and receives a streaming response with correct token tracking
**Priority:** P0
**Depends on:** J0
**Covered:** N

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | Web: Chat | Type "Hello, what can you do?" in textarea | Send button enables |
| 2 | Web: Chat | Press Enter | Input clears; user bubble appears IMMEDIATELY (<200ms), BEFORE any server response |
| 3 | Web: Chat | Observe streaming | `.cursor` visible; assistant content grows progressively (not 0→full jump) |
| 4 | Web: Chat | Wait for completion | `.cursor` disappears; assistant has markdown content length > 0 |
| 5 | Web: Chat | Check token display | Input tokens > 0, output tokens > 0; NOT `0/0` |
| 6 | Web: Sidebar | Verify session created | New `.session-item` under project |
| 7 | Web: Chat | Verify token values match server | Compare displayed tokens with intercepted `chat.done` WS event values |

### Journey J2: Configuration Change

**Goal:** User modifies settings and verifies they take effect across the app
**Priority:** P0
**Depends on:** J0
**Covered:** N

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | Web: Sidebar | Click Config nav | `.config-page` visible |
| 2 | Web: Config | Verify form loaded with current values | 5 sections; fields populated |
| 3 | Web: Config | Change Claude default args to "--verbose" | Field updated |
| 4 | Web: Config | Click Save | Toast success |
| 5 | Web: Browser | Reload page | Page reloads |
| 6 | Web: Config | Navigate to Config, check value | "--verbose" still present (persisted) |
| 7 | Web: Config | Add project "e2e-project-2" with dir "/tmp/e2e2" | New card; toast confirmation |
| 8 | Web: Sidebar | Click Chat nav | Chat page; sidebar shows both projects |
| 9 | Web: Config | Navigate to Config, delete "e2e-project-2" | Card removed; toast confirmation |
| 10 | Web: Browser | Reload, check sidebar | Only original project; deleted project gone |

### Journey J3: Multi-turn Conversation & History Persistence

**Goal:** User has extended conversation; history survives refresh, session switch, and reconnection
**Priority:** P0
**Depends on:** J1
**Covered:** N

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | Web: Chat | Send "What did I just ask you?" | User bubble IMMEDIATELY; assistant references first message |
| 2 | Web: Chat | Wait for response | 4 bubbles total in correct order |
| 3 | Web: Chat | Check token display | Tokens higher than after J1; increased monotonically |
| 4 | Web: Chat | Send "Summarize our conversation" | 6 bubbles total |
| 5 | Web: Browser | Full page refresh (`page.reload()`) | Page reloads; WS reconnects; "Connected" |
| 6 | Web: Sidebar | Verify sessions listed | Same sessions; count unchanged |
| 7 | Web: Sidebar | Click the previous session | All 6 messages loaded in correct order; content matches pre-refresh |
| 8 | Web: Chat | Check tokens after reload | Values match pre-refresh; NOT `0/0` |
| 9 | Web: Sidebar | Click + (new session), then back to original | Original session intact; no data loss |
| 10 | Web: Chat | Send another message in resumed session | Claude has prior context; contextually aware response |

### Journey J4: Token Stats Verification

**Goal:** User verifies that token usage statistics accurately reflect their conversations
**Priority:** P0
**Depends on:** J1
**Covered:** N

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | Web: Sidebar | Click Stats nav | Stats page with "Token Statistics" heading |
| 2 | Web: Stats | Select "e2e-project" from dropdown | 4 summary cards appear |
| 3 | Web: Stats | Check card values | `totalInput` > 0, `totalOutput` > 0; NOT zero for project with conversations |
| 4 | Web: Stats | Compare with API | `GET /api/stats/tokens?project=e2e-project` values match cards |
| 5 | Web: Stats | Check daily table | At least 1 row for today with non-zero values |
| 6 | Web: Stats | Check bar chart | SVG with at least 1 bar |
| 7 | Web: Browser | Reload, re-select project | Same values; no loss |
| 8 | Web: Chat | Navigate to Chat, send new message, return to Stats | Token totals increased to include new conversation |

### Journey J5: Returning User

**Goal:** User closes browser, returns later, resumes without any data loss
**Priority:** P0
**Depends on:** J3
**Covered:** N

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | Web: Browser | Close browser context entirely | Browser closed |
| 2 | Web: Browser | Open new context, navigate to app | Page loads; sidebar and main-content visible |
| 3 | Web: Connection | WS connects | "Connected" |
| 4 | Web: Sidebar | Previous sessions listed | All prior sessions visible under project |
| 5 | Web: Sidebar | Click session from J3 | All messages from J3 displayed in correct order |
| 6 | Web: Chat | Verify content | User and assistant messages match originals exactly; markdown rendered |
| 7 | Web: Chat | Check tokens | Token counts from previous sessions; NOT `0/0` |
| 8 | Web: Chat | Send new message | User bubble immediately; assistant responds with prior context |
| 9 | Web: Stats | Navigate to Stats, select project | Accumulated token usage includes all previous sessions |

### Journey J6: Error Recovery & Resilience

**Goal:** User encounters errors (network drop, bad input) and the app recovers gracefully
**Priority:** P0
**Depends on:** J0
**Covered:** N

| Step | Module | Action | Expected Result |
|------|--------|--------|-----------------|
| 1 | Web: Chat | Start new session, send message | Streaming begins normally |
| 2 | Web: Chat | Simulate WebSocket disconnect mid-stream | Error message or graceful fallback; no crash; cursor disappears |
| 3 | Web: Connection | Wait for auto-reconnect | "Connected" restored within 30s |
| 4 | Web: Chat | Send another message after reconnect | Works normally; user bubble appears; assistant responds |
| 5 | Web: Chat | Try sending empty/whitespace message | Blocked; no bubble sent |
| 6 | Web: Chat | Send to nonexistent project via console WS | `chat.error` with `PROJECT_NOT_FOUND`; UI doesn't crash |
| 7 | Web: Config | Delete the current project being chatted in | Graceful handling; no orphaned chat state |
| 8 | Web: Browser | Reload after error state | App recovers to clean state; no permanent error screen |

---

## Coverage Summary

| Area | Total Cases | Covered (Y) | Partial (P) | Missing (N) |
|------|-------------|-------------|-------------|-------------|
| Chat Page (Web) | 48 | 18 | 1 | 29 |
| Sidebar (Web) | 16 | 8 | 0 | 8 |
| Config Page (Web) | 18 | 8 | 0 | 10 |
| Stats Page (Web) | 19 | 5 | 3 | 11 |
| Onboarding (Web) | 13 | 2 | 0 | 11 |
| CLI: help | 3 | 0 | 0 | 3 |
| CLI: unknown | 2 | 0 | 0 | 2 |
| CLI: install | 5 | 0 | 0 | 5 |
| CLI: uninstall | 2 | 0 | 0 | 2 |
| CLI: start/stop/restart | 4 | 0 | 0 | 4 |
| CLI: status | 2 | 0 | 0 | 2 |
| CLI: logs | 1 | 0 | 0 | 1 |
| CLI: web | 5 | 0 | 0 | 5 |
| CLI: run | 5 | 0 | 0 | 5 |
| User Journeys | 7 | 0 | 0 | 7 |
| **Total** | **150** | **41** | **4** | **105** |

> Note: Coverage marked based on existing E2E tests in `packages/server/e2e/`. Tests currently run against local dev server (port 8081) without Docker isolation — all cases should be migrated to Docker environment.
