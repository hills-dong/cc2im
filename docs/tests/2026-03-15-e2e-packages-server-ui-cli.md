# E2E Test Case Checklist — cc2im (Web + CLI)

Generated: 2026-03-15
Scope: `packages/server/e2e/` (Web UI), `packages/ui/` (Svelte components), `packages/cli/` (CLI)

---

## Project Type Detection

**Mixed** — Playwright config found (`packages/server/e2e/`), CLI binary entry point at `packages/cli/src/cli.ts`.

---

## Module Overview

### Chat Page

| Route/Command | Description |
|---------------|-------------|
| `/` (default) | Main chat interface — sidebar with project/session list, message thread, streaming response display |

### Sidebar

| Route/Command | Description |
|---------------|-------------|
| `/` (sidebar region) | Left panel showing projects, session items, new-session button, and nav buttons (Chat/Config/Stats) |

### Config Page

| Route/Command | Description |
|---------------|-------------|
| `/` → Config nav | Configuration form for Claude settings, Discord/Lark tokens, projects list, and formatter settings |

### Stats Page

| Route/Command | Description |
|---------------|-------------|
| `/` → Stats nav | Token usage statistics — project selector, summary cards, SVG bar chart, daily breakdown table |

### Onboarding

| Route/Command | Description |
|---------------|-------------|
| `/` (first load, no projects) | 5-step wizard: Claude command → test → project → platform tokens → done |

### CLI: `cc2im` commands

| Route/Command | Description |
|---------------|-------------|
| `cc2im install [--config <path>]` | Write systemd/launchd service file, enable and start the service |
| `cc2im uninstall` | Stop, disable, and remove the service unit file |
| `cc2im start` | Start the installed service |
| `cc2im stop` | Stop the running service |
| `cc2im restart` | Restart the service |
| `cc2im status` | Print service status to stdout |
| `cc2im logs` | Tail live service logs |
| `cc2im web [--port N] [--bind H] [--config <path>]` | Start HTTP/WebSocket server and serve Web UI |
| `cc2im run` | Run the bridge in foreground (default when no command given) |
| `cc2im help / -h / --help` | Print usage text |
| `cc2im <unknown>` | Unknown command — print error and usage, exit 1 |

---

## Web E2E Test Cases

### Chat Page

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Chat Page | App loads for the first time | Sidebar and main content area visible on load | UI | Server running at :8081, projects configured | Navigate to `/` | `.sidebar` and `.main-content` both visible within 5s | Y | P0 | Y |
| Chat Page | User sees connection state | Status bar shows "Connected" | UI | Server running, WebSocket reachable | Navigate to `/` | `.conn-status` contains text "Connected" within 5s, indicator color is green | Y | P0 | Y |
| Chat Page | WebSocket disconnects | Status bar shows "Connecting…" or "Disconnected" | UI | Server running | Navigate to `/`, then kill WebSocket connection | `.conn-status` transitions to connecting/disconnected state with visual indicator color change | Y | P1 | N |
| Chat Page | No project selected yet | Empty state prompt rendered | UI | Server running, projects configured, no session selected | Navigate to `/` without selecting a session | `.empty-state` visible with "Select a project" message | Y | P0 | Y |
| Chat Page | User starts a new session | Chat UI appears after clicking new session | UX | Server running, projects loaded | Click `.new-session-btn` | `.chat-input-area` becomes visible; no-messages hint shown | Y | P0 | Y |
| Chat Page | User views empty input | Placeholder text and disabled send button | UX | Session started (new session view) | Open new session, do not type | Textarea placeholder contains "Enter to send"; `.send-btn` is disabled | N | P1 | Y |
| Chat Page | User types a message | Send button enables when text present | UX | Session started (new session view) | Type text into `.message-input` textarea | `.send-btn` becomes enabled | N | P1 | Y |
| Chat Page | Keyboard shortcut to send | Pressing Enter sends message | UX | Session started, text typed | Press Enter in textarea | User bubble appears; input clears | N | P0 | Y |
| Chat Page | Message send and streaming response | Full round-trip: user sends, assistant streams, streaming finishes | Functional | Server running, Claude configured and reachable, new session | Type message, press Enter → wait for assistant bubble, wait for streaming cursor to disappear | User bubble appears; assistant bubble appears; cursor disappears; markdown content rendered with length > 0 | Y | P0 | Y |
| Chat Page | User sends message, user bubble renders | User message appears immediately as a sent bubble | Functional | Session started | Type "hello" → press Enter | `.message-wrap.user` visible containing "hello" within 3s | N | P0 | Y |
| Chat Page | Assistant streams partial response | Streaming cursor visible during response | Functional | Session started, message sent | Send a message, observe assistant bubble during streaming | `.cursor` element visible inside assistant bubble during streaming | Y | P1 | Y |
| Chat Page | Assistant response completes | Cursor disappears after streaming done | Functional | Session started, message sent | Send message → wait for streaming | `.cursor` becomes hidden; full response text visible in `.content.markdown` | N | P0 | Y |
| Chat Page | No messages hint displayed | Hint text shown before first message | Functional | New session created, no messages sent | Open new session | `.no-messages` visible with hint text | N | P1 | Y |
| Chat Page | WebSocket error on unknown project | Chat error returned for unregistered project | Error Handling | Server running, WebSocket connected | Send `chat.send` WS message with `project: "nonexistent-e2e-test"` | WS response type is `chat.error`, error code is `PROJECT_NOT_FOUND` | N | P0 | Y |
| Chat Page | Network failure during streaming | UI shows error or graceful fallback | Error Handling | Session started, message sent mid-flight | Disconnect network while assistant is streaming | Error message shown in chat area; app does not crash; cursor disappears | Y | P1 | N |
| Chat Page | Empty message not sent | User cannot send blank input | Error Handling | New session view | Click send button without typing | Message is not sent; input field remains empty; no user bubble appears | N | P1 | N |
| Chat Page | Markdown formatting rendered | Assistant markdown renders correctly | UI | Session started, message sent asking for markdown | Ask Claude to respond with bold text and a code block | Bold text and code block visually distinct in `.content.markdown` | Y | P2 | N |
| Chat Page | Reconnection after disconnect | App auto-reconnects WebSocket | UX | Server running, previously connected | Simulate network drop then restore | `.conn-status` transitions back to "Connected" without page reload | Y | P1 | N |
| Chat Page | Multi-turn: second message in same session | User sends follow-up after first response completes | Functional | Session started, first round-trip complete (user + assistant messages visible) | Type second message → press Enter | Second user bubble appears below first conversation; assistant streams new response; previous messages remain intact | N | P0 | N |
| Chat Page | Multi-turn: context continuity | Assistant references earlier messages in response | Functional | Session started, first message sent and response received | Send "what did I just say?" or reference prior context | Assistant response acknowledges/references the content of the first message | N | P0 | N |
| Chat Page | Multi-turn: message ordering preserved | Messages appear in chronological order after multiple turns | UI | Session with 2+ completed round-trips | Send 3 messages sequentially, wait for each response | All 6 messages (3 user + 3 assistant) appear in correct chronological order; no duplication or reordering | Y | P0 | N |
| Chat Page | Multi-turn: auto-scroll on new messages | Chat area scrolls to bottom as new messages arrive | UX | Session with several messages causing overflow | Send a message when chat area is scrolled to bottom | Chat area auto-scrolls to show newest message and streaming response | N | P1 | N |
| Chat Page | Multi-turn: send blocked during streaming | Cannot send while assistant is still streaming | UX | Session started, message sent, assistant currently streaming | Try to type and send another message while cursor is animating | Send button disabled or input blocked until streaming completes | N | P1 | N |
| Chat Page | Multi-turn: token count accumulates | Token stats update after each round-trip | Functional | Session with 2+ completed round-trips | Observe token display after first and second response | Token counts (input/output) increase after each round-trip; totals reflect cumulative usage | N | P2 | N |
| Chat Page | Multi-turn: long conversation scroll | Conversation with many messages remains scrollable | UI | Session with 10+ messages (overflow) | Send multiple messages to create long thread | Scrollbar appears; user can scroll up to see earliest messages; scroll down returns to latest | Y | P1 | N |
| Chat Page | History: switch session loads previous messages | Clicking existing session in sidebar loads its history | Functional | At least 2 sessions with messages exist | Click a different session in sidebar | Chat area clears and displays the selected session's message history; user and assistant bubbles rendered correctly | Y | P0 | N |
| Chat Page | History: messages persist after page reload | Refreshing page retains conversation for active session | Functional | Session with messages, session ID known | Send a message, wait for response, reload page, re-select same session | Previous messages still visible after reload; content matches pre-reload state | N | P0 | N |
| Chat Page | History: session resume sends to same Claude session | Follow-up in existing session resumes Claude context | Functional | Existing session with prior messages, session ID in database | Select existing session → send new message | WebSocket `chat.send` includes `sessionId`; Claude receives `--resume sessionId`; response has awareness of prior context | N | P0 | N |
| Chat Page | History: new session vs existing session distinction | New session starts blank, existing session shows history | UI | At least 1 existing session with messages | Click "+" for new session, then click an existing session | New session shows empty state / no-messages hint; existing session shows its message bubbles | Y | P1 | N |
| Chat Page | History: switching sessions preserves unsent input | Typed but unsent text survives session switch | UX | Two sessions available | Type text in session A (don't send) → switch to session B → switch back to A | Typed text still in textarea for session A | N | P2 | N |
| Chat Page | History: empty session in sidebar | Session with no messages shows appropriate state | UI | Session created but no messages sent | Click an empty session in sidebar | Chat area shows no-messages hint or empty state; no crash or stale messages from other session | N | P1 | N |
| Chat Page | History: markdown rendered in loaded history | Historical assistant messages render markdown correctly | UI | Existing session with assistant responses containing markdown (code blocks, bold, lists) | Select session with markdown responses | Markdown formatted correctly in `.content.markdown`; code blocks have syntax highlighting; not raw text | Y | P1 | N |

### Sidebar

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Sidebar | Projects loaded from config | Project sections rendered after load | UI | Server running, at least 1 project in config | Navigate to `/`, wait for load | `.sidebar-loading` not visible; at least 1 `.project-section` rendered | Y | P0 | Y |
| Sidebar | Sessions listed under project | Session items rendered with short IDs | UI | Server running, at least 1 session exists | Navigate to `/` | `.session-item` elements visible; each item text length between 1-8 chars | N | P1 | Y |
| Sidebar | Sidebar loading state clears | Loading indicator disappears | UX | Server running | Navigate to `/` | `.sidebar-loading` not visible within 5s | N | P0 | Y |
| Sidebar | Session selection | Clicking a session activates it | UX | At least 1 session exists | Click first `.session-item` | Clicked item has class `active`; main content updates to show selected session | Y | P0 | Y |
| Sidebar | New session button | Clicking + shows chat input | UX | Projects loaded | Click `.new-session-btn` | `textarea.message-input` becomes visible in main area | N | P0 | Y |
| Sidebar | Nav button: Chat | Chat nav button visible and clickable | UI | Page loaded | Observe top nav area | Nav button for Chat visible | Y | P1 | N |
| Sidebar | Nav button: Config | Config nav button navigates to Config page | Functional | Page loaded | Click `button.nav-btn:has-text('Config')` | `.config-page` becomes visible | N | P0 | Y |
| Sidebar | Nav button: Stats | Stats nav button navigates to Stats page | Functional | Page loaded | Click `button.nav-btn:has-text('Stats')` | `h1:has-text('Token Statistics')` visible | N | P0 | Y |
| Sidebar | No JS errors on page load | Console error-free | Error Handling | Server running | Navigate to `/`, wait 3s, collect `pageerror` events | `errors` array is empty | N | P0 | Y |
| Sidebar | Projects fail to load | Sidebar handles API failure gracefully | Error Handling | Server returns 500 on `/api/projects` | Navigate to `/` | Sidebar does not crash; error state or empty state shown; no blank white screen | Y | P1 | N |
| Sidebar | Empty project list | Sidebar renders cleanly with zero projects | Error Handling | Config has no projects | Navigate to `/` | Onboarding flow shown, or sidebar shows empty state without crashing | Y | P1 | N |

### Config Page

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Config Page | Page loads | Config page renders form sections | UI | Server running | Click Config nav button, wait for load | `.config-page` visible; at least 3 `.config-section` rendered; h1 "Configuration" visible | Y | P0 | Y |
| Config Page | Loading state transitions | Loading indicator shown then hidden | UX | Server running | Navigate to Config | `.loading` visible initially, hidden within 10s | N | P1 | Y |
| Config Page | Config API shape | API returns all required keys | Functional | Server running | `GET /api/config` | Response has `claude`, `projects`, `formatter`, `discord` keys; `discord.token` is `"***"` | N | P0 | Y |
| Config Page | Save config | User edits a field and saves | Functional | Config page loaded | Modify Claude command field → click "Save Config" | Toast "Config saved successfully" appears; no error; change persisted on reload | Y | P0 | N |
| Config Page | Token masking | Discord token displayed masked | UI | Config with discord token saved | Navigate to Config | Discord token input shows masked value (password field), actual token value not visible in DOM as plain text | N | P1 | N |
| Config Page | Add a project | User adds new project via form | Functional | Config page loaded | Click "+ Add Project" → fill name and directory → click "Add Project" | New project card appears in project list; toast "Project added" | Y | P0 | N |
| Config Page | Add project validation | Empty name or directory rejected | Error Handling | Config page loaded, add form open | Click "Add Project" with empty name/directory | Toast error "Project name and directory are required" | N | P1 | N |
| Config Page | Delete a project | User deletes existing project | Functional | At least 1 project in list | Click "Delete" on a project card → confirm | Project card removed from list; toast "Project deleted" | Y | P0 | N |
| Config Page | Save failure | API returns error on save | Error Handling | Server returns 500 on PUT /api/config | Edit field → click Save | Toast error message shown; page does not crash | N | P1 | N |
| Config Page | Config section layout | All 5 form sections present | UI | Config loaded | Navigate to Config, wait for load | Sections: Claude Settings, Discord, Lark/Feishu, Projects, Formatter all visible | Y | P2 | N |
| Config Page | Formatter section numeric inputs | Numeric inputs accept valid values | Functional | Config page loaded | Set max Discord length to 1800 → save | Value persisted; API returns `maxMessageLengthDiscord: 1800` | N | P2 | N |

### Stats Page

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Stats Page | Page loads | Stats page renders with h1 | UI | Server running | Click Stats nav | `h1:has-text('Token Statistics')` visible | Y | P0 | Y |
| Stats Page | No project selected hint | Placeholder shown before project selection | UX | Stats page open | Navigate to Stats, do not select a project | `.empty-hint:has-text('Select a project')` visible | N | P1 | Y |
| Stats Page | Project selector populated | Dropdown shows real projects | Functional | At least 1 project configured | Navigate to Stats | `#project-select` visible; option count >= 2 (including placeholder) | N | P0 | Y |
| Stats Page | Selecting a project loads cards | Summary cards appear after project selected | Functional | Stats page open, project available | Select first project from dropdown | `.summary-cards .card` visible; exactly 4 cards shown | Y | P0 | Y |
| Stats Page | Stats API shape | API returns correct shape | Functional | At least 1 project with session data | `GET /api/stats/tokens?project=<name>` | Response has `totalInput`, `totalOutput`, `totalCache`, `daily` (array) | N | P0 | Y |
| Stats Page | Bar chart renders | SVG chart rendered when daily data exists | UI | Project with historical data selected | Select project with data | `.bar-chart` SVG element visible; bars rendered with date labels | Y | P1 | N |
| Stats Page | Daily breakdown table | Table rows show daily data | UI | Project with historical data selected | Select project with data | `<table>` visible inside `.table-section`; rows correspond to days | Y | P1 | N |
| Stats Page | Projects loading state | "Loading projects…" shown while fetching | UX | Stats page open | Navigate quickly to Stats before projects load | Loading text visible briefly before dropdown appears | N | P2 | N |
| Stats Page | Stats loading state | "Loading statistics…" shown while fetching | UX | Stats page open, project selected | Select a project | `.loading-text` "Loading statistics…" visible briefly before cards appear | N | P2 | N |
| Stats Page | No data for project | Empty hint when no stats data | Error Handling | Project exists but no session history | Select project with zero token usage | `.empty-hint` shown; no JS error | N | P1 | N |
| Stats Page | API failure | Error displayed when stats API fails | Error Handling | Server returns 500 on `/api/stats/tokens` | Select a project | `.error-msg` shown with failure message; page does not crash | N | P1 | N |

### Onboarding

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| Onboarding | First-time setup triggered | Onboarding shown when no projects exist | Functional | Server running, no projects configured | Navigate to `/` | Onboarding overlay visible | Y | P0 | N |
| Onboarding | Step 1: Enter Claude command | Claude command field accepts input | UX | Onboarding visible, step 1 | Type a command path into the command field | "Next" button becomes enabled | N | P0 | N |
| Onboarding | Step 1 validation | Cannot proceed with empty command | Error Handling | Onboarding visible, step 1 | Leave field empty, try to proceed | Next button disabled; cannot advance | N | P1 | N |
| Onboarding | Step 2: Test Claude | Test button triggers verification | Functional | Step 2 active, valid command entered | Click "Test" | Testing spinner shown; then success state displayed | Y | P0 | N |
| Onboarding | Step 2: Test failure | Failed test shows error | Error Handling | Step 2 active, invalid command | Enter non-existent command, click Test | Error message shown; cannot proceed to step 3 | N | P1 | N |
| Onboarding | Step 3: Project details | Name and directory required | Error Handling | Step 3 active | Leave name empty, try to proceed | Cannot advance; validation message or button disabled | N | P1 | N |
| Onboarding | Step 4: Platform tokens | Optional platform tokens accepted | UX | Step 4 active | Leave Discord/Lark tokens empty → click Next | Can advance without entering tokens | N | P2 | N |
| Onboarding | Complete onboarding | Completing wizard transitions to Chat | Functional | All steps completed | Complete all 5 steps | Onboarding hidden; Chat page shown; project appears in sidebar | Y | P0 | N |

---

## CLI E2E Test Cases

### `cc2im help / -h / --help`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: help | User requests help | `cc2im --help` prints usage | Output Validation | cc2im installed | Run `cc2im --help` | stdout contains all commands: install, uninstall, start, stop, restart, status, logs, web, run; exit code 0 | N | P0 | N |
| CLI: help | Short flag `-h` | `-h` is equivalent to `--help` | Input Validation | cc2im installed | Run `cc2im -h` | Same usage text as `--help`; exit code 0 | N | P1 | N |
| CLI: help | Bare `help` command | `cc2im help` prints usage | Input Validation | cc2im installed | Run `cc2im help` | Same usage text; exit code 0 | N | P2 | N |

### `cc2im <unknown>`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: unknown | User miskeys command | Unknown command prints error and exits 1 | Error Handling | cc2im installed | Run `cc2im badcmd` | stderr contains "Unknown command: badcmd"; usage text printed; exit code 1 | N | P0 | N |
| CLI: unknown | No args runs `run` | Default command when no arg | Input Validation | cc2im installed, config present, Discord token configured | Run `cc2im` with no subcommand | Process starts bridge in foreground (does not exit immediately); stdout contains "cc2im starting..." | N | P1 | N |

### `cc2im install`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: install | Happy path install | Service installed and started | Side Effect Validation | Valid config.yaml exists at default or specified path | Run `cc2im install` | Service unit file written to `~/.config/systemd/user/cc2im.service` (Linux) or plist on macOS; stdout "cc2im service installed and started."; service is running | N | P0 | N |
| CLI: install | Custom config path | `--config` flag respected | Input Validation | Config at custom path | Run `cc2im install --config /tmp/my-config.yaml` | Service unit references custom config path in `CC2IM_CONFIG` environment variable | N | P0 | N |
| CLI: install | Config not found | Error when config missing | Error Handling | No config at expected path | Run `cc2im install` with no config.yaml present | stderr contains "Config not found"; exit code 1; no service file written | N | P0 | N |

### `cc2im uninstall`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: uninstall | Happy path uninstall | Service stopped and unit file removed | Side Effect Validation | Service previously installed | Run `cc2im uninstall` | Service unit file deleted; service stopped; stdout "cc2im service uninstalled." | N | P0 | N |
| CLI: uninstall | Not installed | Graceful no-op | Error Handling | Service not installed | Run `cc2im uninstall` with no service file | stdout "cc2im service is not installed."; exit code 0; no crash | N | P1 | N |

### `cc2im start`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: start | Start installed service | Service starts | Output Validation | Service installed but stopped | Run `cc2im start` | stdout "cc2im started."; service becomes active | N | P0 | N |
| CLI: start | Service not installed | Error reported | Error Handling | No service installed | Run `cc2im start` | Error message from systemctl/launchctl printed; non-zero exit code | N | P1 | N |

### `cc2im stop`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: stop | Stop running service | Service stops | Output Validation | Service running | Run `cc2im stop` | stdout "cc2im stopped."; service inactive | N | P0 | N |

### `cc2im restart`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: restart | Restart running service | Service restarts | Output Validation | Service running | Run `cc2im restart` | stdout "cc2im restarted."; service active after brief stop/start | N | P0 | N |

### `cc2im status`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: status | Status of running service | Status output includes "active" | Output Validation | Service running | Run `cc2im status` | stdout contains systemctl/launchctl status output; exit code 0 | N | P0 | N |
| CLI: status | Status of stopped service | Status output shows inactive | Output Validation | Service installed but stopped | Run `cc2im status` | Output reflects stopped state; exit code 0 (graceful, not throws) | N | P1 | N |

### `cc2im logs`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: logs | Tail live logs (Linux) | `journalctl` stream starts | Output Validation | Service running on Linux (systemd) | Run `cc2im logs` | Process spawns `journalctl --user -u cc2im.service -f` without error | N | P1 | N |
| CLI: logs | Tail live logs (macOS) | `tail -f` on log file | Output Validation | Service running on macOS, log file exists | Run `cc2im logs` | Process spawns `tail -f ~/.local/share/cc2im/cc2im.log` | N | P1 | N |
| CLI: logs | No log file yet (macOS) | Graceful message when log absent | Error Handling | macOS, no log file yet | Run `cc2im logs` | stdout "No logs yet."; exit code 0 | N | P2 | N |

### `cc2im web`

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: web | Start web UI on default port | Web server starts on 8080 | Output Validation | Config exists | Run `cc2im web` | stdout "cc2im web UI available at http://0.0.0.0:8080"; HTTP GET `/` returns 200 | N | P0 | N |
| CLI: web | Custom port | `--port` flag changes port | Input Validation | Config exists | Run `cc2im web --port 9090` | stdout URL shows port 9090; HTTP GET `http://localhost:9090/` returns 200 | N | P0 | N |
| CLI: web | Custom bind address | `--bind` flag changes bind host | Input Validation | Config exists | Run `cc2im web --bind 127.0.0.1` | stdout URL shows `127.0.0.1`; server bound to loopback only | N | P1 | N |
| CLI: web | Custom config path | `--config` resolves correctly | Side Effect Validation | Config at custom path | Run `cc2im web --config /tmp/cc2im-test.yaml` | Server starts using specified config; projects from that config visible in `/api/projects` | N | P1 | N |
| CLI: web | Non-numeric port | Invalid port value | Error Handling | Config exists | Run `cc2im web --port abc` | Process exits with error; server does not start on port NaN | N | P1 | N |

### `cc2im run` (foreground bridge mode)

| Module/Page | User Scenario | Test Case Name | Dimension | Preconditions | Steps | Expected Result | Screenshot Verify | Priority | Covered |
|-------------|---------------|----------------|-----------|---------------|-------|-----------------|-------------------|----------|---------|
| CLI: run | Starts without crashing | Bridge starts in foreground | Output Validation | Valid config, Discord token configured | Run `cc2im run` | stdout "cc2im starting..." then "cc2im ready."; process stays alive | N | P0 | N |
| CLI: run | Missing Discord token | Starts with no adapters | Error Handling | Config with no discord.token | Run `cc2im run` | Process starts and reaches "cc2im ready." without crash; no Discord adapter registered | N | P1 | N |
| CLI: run | Graceful shutdown SIGTERM | SIGTERM triggers clean shutdown | Side Effect Validation | Bridge running | Send SIGTERM to process | stdout contains shutdown message; process exits 0; no pending-restart records left | N | P1 | N |
| CLI: run | Graceful shutdown SIGINT | SIGINT (Ctrl+C) triggers clean shutdown | Side Effect Validation | Bridge running | Send SIGINT to process | Process exits 0; adapters stopped | N | P1 | N |
| CLI: run | Pending restart recovery | Threads marked pending-restart are resumed | Side Effect Validation | DB has pending-restart records from prior run | Run `cc2im run` | stdout logs "Recovering N pending restart(s)"; each thread resumed; pending-restart records cleared | N | P1 | N |

---

## Coverage Summary

| Area | Total Cases | Covered (Y) | Missing (N) |
|------|-------------|-------------|-------------|
| Chat Page (Web) | 33 | 10 | 23 |
| Sidebar (Web) | 11 | 6 | 5 |
| Config Page (Web) | 11 | 3 | 8 |
| Stats Page (Web) | 11 | 5 | 6 |
| Onboarding (Web) | 8 | 0 | 8 |
| CLI: help | 3 | 0 | 3 |
| CLI: unknown | 2 | 0 | 2 |
| CLI: install | 3 | 0 | 3 |
| CLI: uninstall | 2 | 0 | 2 |
| CLI: start | 2 | 0 | 2 |
| CLI: stop | 1 | 0 | 1 |
| CLI: restart | 1 | 0 | 1 |
| CLI: status | 2 | 0 | 2 |
| CLI: logs | 3 | 0 | 3 |
| CLI: web | 5 | 0 | 5 |
| CLI: run | 5 | 0 | 5 |
| **Total** | **104** | **24** | **80** |

> Note: The `helpers.test.ts` file covers `formatUserError` and `stripStatusIcon` as unit tests, not E2E tests. They are not counted as E2E coverage above.

