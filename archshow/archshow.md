---
description: Generate an interactive architecture diagram (single-file HTML) from a codebase. Analyzes modules, functions, dependencies, and interface abstractions to produce a swim-lane visualization with animated dependency chains.
---

# archshow — Interactive Architecture Diagram Generator

You are an architecture visualization specialist. Your job is to analyze a codebase and produce a **single self-contained HTML file** that renders an interactive module-relationship diagram.

## Process

### Phase 1: Codebase Analysis

Thoroughly explore the codebase to extract:

1. **Modules** — Identify logical modules (packages, classes, major files). For each:
   - `id`: short kebab-case identifier
   - `name`: display name
   - `color`: assign from the palette below based on role
   - `path`: source file path relative to project root

2. **Swim Lanes** — Group modules into 3–6 lanes. For each:
   - `id`, `name`, `color`, `modules[]`, `flex` (relative width)
   - Optional `layout[]` for horizontal pairing of related modules within a lane (use nested arrays like `['modA', ['modB', 'modC']]`)

3. **Module Functions** — For each module, list its key public functions/methods. For each:
   - `id`: `"module:functionName"` format
   - `fn`: display name (e.g., `"handleMessage()"`)
   - `entry`: true if this is an entry point (event handler, main, CLI command)
   - `badge`: optional — `"orch"` (orchestrator), `"cb"` (callback), `"catch"` (error handler), `"timer"` (scheduled)
   - `desc`: one-line description of what it does
   - `file`: source file path

4. **Dependency Chains** — Trace key execution flows through the system. For each chain:
   - Give it a human-readable `name`
   - List `edges[]` as `{ from, to, type }` where:
     - `type: 'dependency'` — A calls/depends on B
     - `type: 'implements'` — A implements/registers with interface B
   - Each chain should start from an `entry: true` function
   - Chains should cover: main flows, startup, shutdown, error paths, interface registrations

5. **Interface Abstractions** — Identify dependency inversion patterns and model them explicitly:

   **What to look for:**
   - Interfaces/abstract types that concrete modules implement (e.g., `PlatformAdapter`)
   - Callback type abstractions passed between modules (e.g., `StreamCallback`)
   - DTOs/value objects used as contracts between layers (e.g., `IncomingMessage`, `StreamEvent`)
   - Config types consumed by multiple modules (e.g., `AppConfig`)

   **How to model them:**
   - Create a dedicated "Types" or "Interfaces" module containing all shared abstractions as functions
   - Mark the Types module's main interface function as `entry: true` so it gets a dedicated chain
   - **Callers depend on the interface, not the implementation.** When module A calls module B through an interface, draw `A → Interface` (dependency), NOT `A → B` directly. This reflects how the code actually works — A holds a reference to the interface type, not to B's concrete class.
   - **Implementors register with the interface.** Draw `B → Interface` (implements). This shows which concrete modules fulfill the contract.
   - Create a dedicated "Interface Registration" chain showing all `implements` edges together. This chain answers: "who implements what?"

   **Example pattern:**
   ```
   // In execution chains (dependency edges):
   orchestrator:handleMessage → types:PlatformAdapter    // calls through interface

   // In the registration chain (implements edges):
   discord:onMessage     → types:PlatformAdapter         // implements the interface
   lark:onMessage        → types:PlatformAdapter         // implements the interface
   webAdapter:onMessage  → types:PlatformAdapter         // implements the interface
   ```

   **Why this matters:** Drawing `orchestrator → discord:sendMessage` directly hides the architectural intent — it looks like tight coupling when the code is actually decoupled via an interface. By routing through the Types module, the diagram accurately shows the dependency inversion.

### Phase 1.5: Dependency-Flow Lane Design

**This phase is critical.** Lane design must be driven by the actual dependency graph, not by package structure or functional categories.

#### Step 1: Build the dependency graph

Before designing lanes, trace the real import/call relationships between modules. For each module, list what it calls and what calls it. The goal is to understand the **direction of flow**: which modules are upstream (closer to user input) and which are downstream (closer to external services or storage).

#### Step 2: Identify the flow axis

Most systems have a dominant flow direction. Examples:
- **Request-response**: Client → Gateway → Service → Storage → External
- **Event-driven**: Producer → Broker → Consumer → Sink
- **Pipeline**: Ingestion → Transform → Enrich → Output

Arrange lanes left-to-right (or top-to-bottom) along this flow axis. The leftmost lane should contain entry points (where data enters the system), and the rightmost should contain terminal dependencies (databases, external APIs, output).

#### Step 3: Place modules by dependency position, not package

A module belongs in the lane that matches its position in the call chain:
- **Wrong**: Group by package (`core/`, `server/`, `lib/`) — packages are code organization, not architecture
- **Wrong**: Group by category ("Infrastructure", "Utilities") — too abstract, loses flow information
- **Right**: Group by call-chain position — modules that sit at the same depth in the dependency graph share a lane

Ask for each module: "When a request flows through the system, at what stage does this module get called?" Modules called at the same stage belong together.

#### Step 4: Optimize for short connections

The #1 layout goal: **most edges should connect adjacent lanes**. If your design has many edges skipping 2+ lanes, your lane assignment is wrong. Rebalance:
- Merge distant lanes that share heavy traffic
- Move a module to the lane where most of its connections point
- Tightly-coupled modules (mutual calls, shared state) must be in the same lane or adjacent lanes — use `layout[]` horizontal pairing for co-located pairs

#### Step 5: Size lanes by content density

Set `flex` values proportional to module count and function count in each lane. A lane with 5 modules and 30 functions needs more space than a lane with 1 module and 3 functions. Avoid large empty areas.

#### Anti-patterns to avoid

| Anti-pattern | Why it fails | Fix |
|---|---|---|
| One lane per package | Packages ≠ architecture layers | Regroup by call-chain depth |
| "Infrastructure" catch-all lane | Store, Config, Logger have different callers | Split by who calls them |
| Singleton lane for 1 small module | Wastes space, creates long crossing lines | Merge into the lane of its primary caller |
| Entry points spread across lanes | Hard to see where flows start | Consolidate entries in leftmost lane |

### Phase 2: Color Assignment

Use this palette based on module role:

| Role | Color | Var |
|------|-------|-----|
| Primary platform / client | `#5865F2` | blue |
| Secondary platform / client | `#2D60F5` | lark-blue |
| Core / routing / processing | `#4cc9f0` | cyan |
| External service / agent | `#fb923c` | orange |
| Storage / infrastructure | `#71717a` | store |
| API layer | `#a78bfa` | purple |
| CLI / entry point | `#34d399` | green |

Assign each module a color from this palette. Related modules should share colors. Unique/important modules get distinct colors.

### Phase 3: Generate HTML

Produce a single self-contained HTML file using the exact template structure below. Replace only the DATA section (MODULES, LANES, MODULE_FUNCTIONS, CHAINS) and the project title/legend. **Do not modify the CSS, rendering logic, or interaction code.**

## Output Template

Write the complete HTML file to `archshow/interactive.html` (or the path specified by the user).

The file structure must be:

```
<!DOCTYPE html>
<html lang="en">
<head>
  [meta + font link + CSS — copy exactly from template]
</head>
<body>
  [controls bar — update project name only]
  [legend — update module list to match your modules]
  [main swim area — no changes]
  [entry bar — no changes]
  <script>
    // ═══ DATA ═══
    const MODULES = [ /* your analyzed modules */ ];
    const LANES = [ /* your swim lanes */ ];
    const MODULE_FUNCTIONS = { /* your functions per module */ };
    const CHAINS = { /* your dependency chains */ };

    // ═══ ENGINE (copy exactly — do not modify) ═══
    [all rendering, interaction, animation code]
  </script>
</body>
</html>
```

## Complete HTML Template

Below is the full template. The DATA section contains placeholder comments — replace those with your analysis results. Everything else must be copied verbatim.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PROJECT_NAME — Architecture Diagram</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #09090b;
  --bg-card: #18181b;
  --bg-card-hover: #1f1f23;
  --border: #27272a;
  --border-hover: #3f3f46;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --text-dim: #71717a;
  --cyan: #4cc9f0;
  --green: #34d399;
  --yellow: #fbbf24;
  --orange: #fb923c;
  --purple: #a78bfa;
  --blue: #5865F2;
  --lark-blue: #2D60F5;
  --store: #71717a;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  width: 100vw; height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* ── Controls Bar ── */
#controls {
  position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
  background: rgba(9,9,11,0.94); backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 10px;
  padding: 0 16px; height: 46px;
}
#controls h1 { font-size: 14px; font-weight: 700; letter-spacing: -0.3px; white-space: nowrap; }
#controls h1 span { color: var(--cyan); }
.ctrl-sep { width: 1px; height: 22px; background: var(--border); flex-shrink: 0; }
.ctrl-btn {
  font-size: 12px; padding: 5px 12px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-muted); cursor: pointer; font-family: var(--font-mono);
  transition: all 0.15s; white-space: nowrap; line-height: 1;
}
.ctrl-btn:hover { border-color: var(--border-hover); color: var(--text); }
.ctrl-btn.active { border-color: var(--cyan); color: var(--cyan); background: rgba(76,201,240,0.08); }
#chain-name {
  font-size: 13px; color: var(--yellow); font-weight: 600;
  font-family: var(--font-mono); display: none; white-space: nowrap;
}
.speed-label { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono); }
.speed-btn {
  font-size: 11px; padding: 3px 8px; border-radius: 4px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-dim); cursor: pointer; font-family: var(--font-mono);
  transition: all 0.15s;
}
.speed-btn:hover { color: var(--text-muted); }
.speed-btn.active { border-color: var(--yellow); color: var(--yellow); background: rgba(251,191,36,0.08); }
#speed-group { display: flex; align-items: center; gap: 4px; }
#legend-btn { margin-left: auto; }

/* ── Legend overlay ── */
#legend-overlay {
  position: fixed; top: 46px; right: 0; bottom: 0;
  width: 260px; background: rgba(9,9,11,0.96); backdrop-filter: blur(12px);
  border-left: 1px solid var(--border);
  z-index: 900; padding: 20px 16px;
  transform: translateX(100%); transition: transform 0.3s ease;
  overflow-y: auto;
}
#legend-overlay.open { transform: translateX(0); }
#legend-overlay h3 {
  font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
  color: var(--text-dim); margin-bottom: 12px; margin-top: 16px;
}
#legend-overlay h3:first-child { margin-top: 0; }
.legend-item { display: flex; align-items: center; gap: 10px; padding: 5px 0; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-line { width: 28px; height: 2px; flex-shrink: 0; border-radius: 1px; }
.legend-label { font-size: 12px; color: var(--text-muted); font-family: var(--font-mono); }
.legend-entry-sample {
  display: inline-block; width: 40px; height: 16px; border-radius: 4px;
  border-left: 3px solid var(--yellow); background: var(--bg-card);
  border-top: 1px solid var(--border); border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}

/* ── Main area ── */
#main {
  position: fixed; top: 46px; left: 0; right: 0; bottom: 0;
  overflow: auto;
}
#swim-container {
  position: relative;
  min-width: max-content;
  padding: 0 24px 40px 24px;
}

/* ── Lane headers ── */
#swim-header {
  display: flex;
  gap: 20px;
  position: sticky; top: 0; z-index: 100;
  background: rgba(9,9,11,0.92); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
  padding: 12px 0 10px 0;
}
.lane-header {
  min-width: 180px;
  text-align: center;
  padding: 8px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-dim);
  border-top: 2px solid var(--lane-color);
  font-family: var(--font-mono);
}

/* ── Swim lanes body ── */
#swim-lanes {
  display: flex;
  gap: 20px;
  position: relative;
  padding-top: 16px;
  min-height: calc(100vh - 120px);
}
.lane {
  min-width: 180px;
  background: rgba(24,24,27,0.3);
  border: 1px solid rgba(39,39,42,0.5);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
  transition: opacity 0.4s;
}
.lane .module-pair {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.lane .module-pair > .module-group { flex: 1; }
.lane.dimmed { opacity: 0.25; }

/* ── Module group within a lane ── */
.module-group {
  flex: 1;
  min-width: 0;
}
.module-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-mono);
}
.module-label-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.module-path {
  margin-left: auto;
  font-size: 9px;
  font-weight: 400;
  color: var(--text-dim);
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-transform: none;
  letter-spacing: 0;
}

/* ── Function pills ── */
.fn-pill {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 4px 8px;
  margin-bottom: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  transition: all 0.3s;
  position: relative;
  cursor: default;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}
.fn-pill.has-vertical-conn {
  margin-bottom: 14px;
}
.fn-pill[data-entry="true"] {
  cursor: pointer;
  border-left: 3px solid var(--yellow);
}
.fn-pill[data-entry="true"]:hover {
  border-color: var(--yellow);
  color: var(--text);
  background: rgba(251,191,36,0.05);
}
.fn-pill.highlighted {
  border-color: var(--yellow) !important;
  color: var(--text);
  background: rgba(251,191,36,0.08);
  box-shadow: 0 0 12px rgba(251,191,36,0.12);
  z-index: 10;
}
.fn-pill.dimmed {
  opacity: 0.15;
}
.entry-dot {
  display: inline-block;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--yellow);
  margin-right: 3px;
  vertical-align: middle;
}
.fn-info-btn {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px; height: 14px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-dim);
  font-size: 9px;
  line-height: 12px;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 5;
  font-family: var(--font-sans);
}
.fn-pill:hover .fn-info-btn { opacity: 1; }
.fn-info-btn:hover { border-color: var(--cyan); color: var(--cyan); background: var(--bg-card); }

/* Popover */
.fn-popover {
  position: absolute;
  z-index: 200;
  width: 280px;
  background: var(--bg-card);
  border: 1px solid var(--border-hover);
  border-radius: 8px;
  padding: 12px 14px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.5);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
  pointer-events: auto;
}
.fn-popover-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.fn-popover-header .pop-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.fn-popover-header .pop-module {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.fn-popover-header .pop-close {
  margin-left: auto;
  cursor: pointer;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1;
}
.fn-popover-header .pop-close:hover { color: var(--text); }
.fn-popover .pop-fn {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--cyan);
  margin-bottom: 6px;
}
.fn-popover .pop-desc {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.6;
}
.fn-popover .pop-file {
  margin-top: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
}

/* ── SVG overlay ── */
#svg-overlay {
  position: absolute;
  top: 0; left: 0;
  pointer-events: none;
  z-index: 50;
}
#svg-overlay .conn-hit { pointer-events: stroke; }
.conn-path {
  fill: none;
  stroke-width: 0.8;
  opacity: 0.12;
  transition: opacity 0.4s, stroke-width 0.4s;
}
.conn-path.dependency { stroke: #fbbf24; }
.conn-path.implements { stroke: #a78bfa; stroke-dasharray: 6 3; }
.conn-path.active { opacity: 0.6; stroke-width: 1.5; }
.conn-path.dimmed { opacity: 0.02; }
.fn-badge {
  display: inline-block;
  font-size: 7px;
  padding: 0 3px;
  border-radius: 2px;
  margin-left: 3px;
  vertical-align: middle;
  font-family: var(--font-sans);
  font-weight: 600;
  line-height: 1.5;
}
.fn-badge.badge-timer { background: #fbbf2430; color: #fbbf24; }
.fn-badge.badge-catch { background: #f8717130; color: #f87171; }
.fn-badge.badge-cb { background: #a78bfa30; color: #a78bfa; }
.fn-badge.badge-orch { background: #34d39930; color: #34d399; }
.conn-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  pointer-events: stroke;
  cursor: grab;
}
.conn-hit:hover + .conn-path { opacity: 0.5; stroke-width: 2.5; }
.conn-hit.dragging { cursor: grabbing; }

/* ── Entry points bar ── */
#entry-bar {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 800;
  background: rgba(9,9,11,0.94); backdrop-filter: blur(14px);
  border-top: 1px solid var(--border);
  padding: 10px 20px;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
#entry-bar .bar-label {
  font-size: 11px; color: var(--text-dim); font-family: var(--font-mono);
  text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px;
  white-space: nowrap;
}
.entry-chip {
  font-size: 11px; padding: 4px 10px; border-radius: 5px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-muted); cursor: pointer; font-family: var(--font-mono);
  transition: all 0.2s; white-space: nowrap;
}
.entry-chip:hover {
  border-color: var(--yellow); color: var(--yellow);
  background: rgba(251,191,36,0.06);
}
.entry-chip.active {
  border-color: var(--yellow); color: var(--yellow);
  background: rgba(251,191,36,0.1);
  box-shadow: 0 0 8px rgba(251,191,36,0.15);
}

/* ── Pulse on step ── */
@keyframes pill-pulse {
  0% { box-shadow: 0 0 0 0 rgba(251,191,36,0.4); }
  100% { box-shadow: 0 0 0 8px rgba(251,191,36,0); }
}
.fn-pill.pulse {
  animation: pill-pulse 0.5s ease-out;
}
</style>
</head>
<body>

<!-- Controls — UPDATE: project name in h1 -->
<div id="controls">
  <h1><span>PROJECT_NAME</span> Architecture</h1>
  <div class="ctrl-sep"></div>
  <span id="chain-name"></span>
  <button class="ctrl-btn" onclick="resetChain()">Reset</button>
  <div class="ctrl-sep"></div>
  <div id="speed-group">
    <span class="speed-label">Speed</span>
    <button class="speed-btn" onclick="setSpeed(0.5)">0.5x</button>
    <button class="speed-btn active" onclick="setSpeed(1)">1x</button>
    <button class="speed-btn" onclick="setSpeed(2)">2x</button>
  </div>
  <button class="ctrl-btn" id="legend-btn" onclick="toggleLegend()">Legend</button>
</div>

<!-- Legend — UPDATE: module colors/names to match your modules -->
<div id="legend-overlay">
  <h3>Modules</h3>
  <!-- Add one legend-item per unique module color group -->
  <!-- Example: <div class="legend-item"><div class="legend-dot" style="background:#5865F2"></div><span class="legend-label">Module Name</span></div> -->
  <h3>Flow</h3>
  <div class="legend-item"><div class="legend-line" style="background:#fbbf24"></div><span class="legend-label">Dependency (calls)</span></div>
  <div class="legend-item"><div class="legend-line" style="background:#a78bfa; background-image:repeating-linear-gradient(90deg, #a78bfa 0 6px, transparent 6px 9px); background-color:transparent;"></div><span class="legend-label">Implements (registration)</span></div>
  <h3>Badges</h3>
  <div class="legend-item"><span class="fn-badge badge-orch" style="margin:0">orch</span><span class="legend-label">Orchestrator — coordinates multiple steps</span></div>
  <div class="legend-item"><span class="fn-badge badge-cb" style="margin:0">cb</span><span class="legend-label">Callback — invoked asynchronously</span></div>
  <div class="legend-item"><span class="fn-badge badge-catch" style="margin:0">catch</span><span class="legend-label">Catch — error handler</span></div>
  <div class="legend-item"><span class="fn-badge badge-timer" style="margin:0">timer</span><span class="legend-label">Timer — scheduled execution</span></div>
  <h3>Entry Points</h3>
  <div class="legend-item"><div class="legend-entry-sample"></div><span class="legend-label">Clickable entry</span></div>
</div>

<!-- Main swim area — DO NOT MODIFY -->
<div id="main">
  <div id="swim-container">
    <div id="swim-header"></div>
    <div id="swim-lanes"></div>
    <svg id="svg-overlay">
      <defs>
        <marker id="arrow-dep" markerWidth="4" markerHeight="3.5" refX="3.5" refY="1.75" orient="auto">
          <polygon points="0 0, 4 1.75, 0 3.5" fill="#fbbf24" opacity="0.7"/>
        </marker>
        <marker id="arrow-impl" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
          <polygon points="0 0, 5 2, 0 4" fill="none" stroke="#a78bfa" stroke-width="0.8"/>
        </marker>
        <filter id="glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-blue" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
    </svg>
  </div>
</div>

<!-- Entry bar — DO NOT MODIFY -->
<div id="entry-bar">
  <span class="bar-label">Entry Points</span>
</div>

<script>
// ═══════════════════════════════════════════════════════════════════
// DATA — REPLACE THIS SECTION WITH YOUR ANALYSIS
// ═══════════════════════════════════════════════════════════════════

const MODULES = [
  // { id: 'mymod', name: 'MyModule', color: '#4cc9f0', path: 'src/mymod.ts' },
];

const LANES = [
  // { id: 'layer1', name: 'Layer 1', color: '#5865F2', modules: ['mod1', 'mod2'], flex: 3 },
];

const MODULE_FUNCTIONS = {
  // mymod: [
  //   { id: 'mymod:init', fn: 'init()', entry: true, desc: 'Initialize module.', file: 'src/mymod.ts' },
  //   { id: 'mymod:process', fn: 'process()', badge: 'orch', desc: 'Process data.', file: 'src/mymod.ts' },
  // ],
};

const CHAINS = {
  // 'mymod:init': {
  //   name: 'Initialization',
  //   edges: [
  //     { from: 'mymod:init', to: 'othermod:setup', type: 'dependency' },
  //   ]
  // },
};

// ═══════════════════════════════════════════════════════════════════
// ENGINE — DO NOT MODIFY BELOW THIS LINE
// ═══════════════════════════════════════════════════════════════════

let activeChain = null;
let animating = false;
let animSpeed = 1;
let animFrame = null;
let glowDots = [];
const pillEls = {};
const pathEls = {};
let svgEl, lanesEl, containerEl;

const moduleLaneIndex = {};
LANES.forEach((lane, i) => {
  lane.modules.forEach(modId => { moduleLaneIndex[modId] = i; });
});

function buildHeader() {
  const header = document.getElementById('swim-header');
  LANES.forEach(lane => {
    const el = document.createElement('div');
    el.className = 'lane-header';
    el.style.setProperty('--lane-color', lane.color);
    el.style.flex = lane.flex;
    el.textContent = lane.name;
    header.appendChild(el);
  });
}

let openPopover = null;

function closePopover() {
  if (openPopover) { openPopover.remove(); openPopover = null; }
}

function showPopover(fnData, modData, anchorEl) {
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'fn-popover';
  pop.innerHTML = `
    <div class="fn-popover-header">
      <span class="pop-dot" style="background:${modData.color}"></span>
      <span class="pop-module">${modData.name}</span>
      <span class="pop-close" onclick="closePopover()">×</span>
    </div>
    <div class="pop-fn">${fnData.fn}</div>
    <div class="pop-desc">${fnData.desc || ''}</div>
    ${fnData.file ? `<div class="pop-file">${fnData.file}</div>` : ''}`;

  const rect = anchorEl.getBoundingClientRect();
  const mainRect = document.getElementById('main').getBoundingClientRect();
  pop.style.left = (rect.right - mainRect.left + 8) + 'px';
  pop.style.top = (rect.top - mainRect.top - 4) + 'px';

  document.getElementById('swim-container').appendChild(pop);
  openPopover = pop;

  requestAnimationFrame(() => {
    const popRect = pop.getBoundingClientRect();
    if (popRect.right > window.innerWidth - 10) {
      pop.style.left = (rect.left - mainRect.left - popRect.width - 8) + 'px';
    }
    if (popRect.bottom > window.innerHeight - 10) {
      pop.style.top = (rect.bottom - mainRect.top - popRect.height + 4) + 'px';
    }
  });
}

function buildModuleGroup(modId) {
  const mod = MODULES.find(m => m.id === modId);
  const fns = MODULE_FUNCTIONS[modId] || [];
  const group = document.createElement('div');
  group.className = 'module-group';
  group.dataset.module = modId;
  const label = document.createElement('div');
  label.className = 'module-label';
  label.innerHTML = `<span class="module-label-dot" style="background:${mod.color}"></span>${mod.name}${mod.path ? `<span class="module-path">${mod.path}</span>` : ''}`;
  group.appendChild(label);
  fns.forEach(f => {
    const pill = document.createElement('div');
    pill.className = 'fn-pill';
    pill.dataset.fn = f.id;
    pill.style.paddingRight = '20px';

    if (f.entry) {
      pill.dataset.entry = 'true';
      pill.innerHTML = `<span class="entry-dot"></span>${f.fn}`;
      pill.addEventListener('click', (e) => {
        if (e.target.closest('.fn-info-btn')) return;
        toggleChain(f.id);
      });
    } else {
      pill.textContent = f.fn;
    }

    if (f.badge) {
      const badgeEl = document.createElement('span');
      badgeEl.className = `fn-badge badge-${f.badge}`;
      badgeEl.textContent = f.badge;
      pill.appendChild(badgeEl);
    }

    const btn = document.createElement('span');
    btn.className = 'fn-info-btn';
    btn.textContent = 'i';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showPopover(f, mod, pill);
    });
    pill.appendChild(btn);

    pill.title = f.id;
    group.appendChild(pill);
    pillEls[f.id] = pill;
  });
  return group;
}

function buildLanes() {
  lanesEl = document.getElementById('swim-lanes');
  LANES.forEach(lane => {
    const laneEl = document.createElement('div');
    laneEl.className = 'lane';
    laneEl.dataset.lane = lane.id;
    laneEl.style.flex = lane.flex;

    const items = lane.layout || lane.modules.map(m => m);
    items.forEach(item => {
      if (Array.isArray(item)) {
        const pair = document.createElement('div');
        pair.className = 'module-pair';
        item.forEach(modId => pair.appendChild(buildModuleGroup(modId)));
        laneEl.appendChild(pair);
      } else {
        laneEl.appendChild(buildModuleGroup(item));
      }
    });

    lanesEl.appendChild(laneEl);
  });
}

function buildEntryBar() {
  const bar = document.getElementById('entry-bar');
  const entries = [];
  for (const [modId, fns] of Object.entries(MODULE_FUNCTIONS)) {
    fns.filter(f => f.entry).forEach(f => {
      if (CHAINS[f.id]) {
        entries.push({ id: f.id, name: CHAINS[f.id].name });
      }
    });
  }
  entries.forEach(e => {
    const chip = document.createElement('button');
    chip.className = 'entry-chip';
    chip.textContent = e.name;
    chip.dataset.chain = e.id;
    chip.addEventListener('click', () => toggleChain(e.id));
    bar.appendChild(chip);
  });
}

function getLaneIndex(fnId) {
  const modId = fnId.split(':')[0];
  return moduleLaneIndex[modId] !== undefined ? moduleLaneIndex[modId] : -1;
}

function pillCenter(fnId) {
  const el = pillEls[fnId];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cr = containerEl.getBoundingClientRect();
  return {
    x: r.left - cr.left + r.width / 2,
    y: r.top - cr.top + r.height / 2,
    left: r.left - cr.left,
    right: r.left - cr.left + r.width,
    top: r.top - cr.top,
    bottom: r.top - cr.top + r.height,
    w: r.width,
    h: r.height,
  };
}

const pathOffsets = {};

function getDefaultCP(fromId, toId) {
  const a = pillCenter(fromId);
  const b = pillCenter(toId);
  if (!a || !b) return null;

  const fromMod = fromId.split(':')[0];
  const toMod = toId.split(':')[0];

  if (fromMod === toMod) {
    const sx = a.x, sy = a.bottom + 2;
    const ex = b.x, ey = b.top - 2;
    const dy = ey - sy;
    return { sx, sy, ex, ey, cp1x: sx, cp1y: sy + dy * 0.4, cp2x: ex, cp2y: ey - dy * 0.4, vertical: true };
  }

  const sx = a.right + 2, sy = a.y;
  const ex = b.left - 2, ey = b.y;
  const dx = ex - sx;
  return { sx, sy, ex, ey, cp1x: sx + dx * 0.4, cp1y: sy, cp2x: sx + dx * 0.6, cp2y: ey, vertical: false };
}

function buildPath(fromId, toId) {
  const cp = getDefaultCP(fromId, toId);
  if (!cp) return '';

  const key = `${fromId}|${toId}`;
  const off = pathOffsets[key] || { cp1: {dx:0,dy:0}, cp2: {dx:0,dy:0} };

  const c1x = cp.cp1x + off.cp1.dx;
  const c1y = cp.cp1y + off.cp1.dy;
  const c2x = cp.cp2x + off.cp2.dx;
  const c2y = cp.cp2y + off.cp2.dy;

  return `M ${cp.sx} ${cp.sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${cp.ex} ${cp.ey}`;
}

function buildAllPaths() {
  svgEl = document.getElementById('svg-overlay');
  const defs = svgEl.querySelector('defs');
  svgEl.innerHTML = '';
  svgEl.appendChild(defs);

  document.querySelectorAll('.fn-pill.has-vertical-conn').forEach(el => el.classList.remove('has-vertical-conn'));
  const vertConnSources = new Set();
  for (const chain of Object.values(CHAINS)) {
    chain.edges.forEach(e => {
      const fromMod = e.from.split(':')[0];
      const toMod = e.to.split(':')[0];
      if (fromMod === toMod) vertConnSources.add(e.from);
    });
  }
  vertConnSources.forEach(fnId => {
    if (pillEls[fnId]) pillEls[fnId].classList.add('has-vertical-conn');
  });

  requestAnimationFrame(() => {
    svgEl.setAttribute('width', containerEl.scrollWidth);
    svgEl.setAttribute('height', containerEl.scrollHeight);
    svgEl.style.width = containerEl.scrollWidth + 'px';
    svgEl.style.height = containerEl.scrollHeight + 'px';
  });
  svgEl.setAttribute('width', containerEl.scrollWidth);
  svgEl.setAttribute('height', containerEl.scrollHeight);
  svgEl.style.width = containerEl.scrollWidth + 'px';
  svgEl.style.height = containerEl.scrollHeight + 'px';

  const edgeSet = new Map();
  for (const chain of Object.values(CHAINS)) {
    chain.edges.forEach(e => {
      const key = `${e.from}|${e.to}`;
      if (!edgeSet.has(key)) edgeSet.set(key, { type: e.type });
    });
  }

  for (const [key, info] of edgeSet) {
    const [fromId, toId] = key.split('|');
    const d = buildPath(fromId, toId);
    if (!d) continue;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d);
    hit.classList.add('conn-hit');
    hit.dataset.key = key;
    svgEl.appendChild(hit);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.classList.add('conn-path', info.type);
    path.dataset.from = fromId;
    path.dataset.to = toId;
    const markerMap = { dependency: 'url(#arrow-dep)', implements: 'url(#arrow-impl)' };
    path.setAttribute('marker-end', markerMap[info.type] || 'url(#arrow-dep)');
    svgEl.appendChild(path);

    pathEls[key] = path;
    hitEls[key] = hit;
  }

  initPathDrag();
}

const hitEls = {};
let dragState = null;

function initPathDrag() {
  const svg = document.getElementById('svg-overlay');

  svg.addEventListener('mousedown', e => {
    const hit = e.target.closest('.conn-hit');
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();

    const key = hit.dataset.key;
    const [fromId, toId] = key.split('|');
    const cp = getDefaultCP(fromId, toId);
    if (!cp) return;

    const cr = containerEl.getBoundingClientRect();
    const mx = e.clientX - cr.left + containerEl.scrollLeft;
    const my = e.clientY - cr.top + containerEl.scrollTop;

    const off = pathOffsets[key] || { cp1: {dx:0,dy:0}, cp2: {dx:0,dy:0} };
    const c1x = cp.cp1x + off.cp1.dx, c1y = cp.cp1y + off.cp1.dy;
    const c2x = cp.cp2x + off.cp2.dx, c2y = cp.cp2y + off.cp2.dy;
    const d1 = (mx - c1x) ** 2 + (my - c1y) ** 2;
    const d2 = (mx - c2x) ** 2 + (my - c2y) ** 2;
    const which = d1 <= d2 ? 'cp1' : 'cp2';

    hit.classList.add('dragging');
    dragState = { key, fromId, toId, which, startX: mx, startY: my, origOff: { ...off[which] } };
  });

  window.addEventListener('mousemove', e => {
    if (!dragState) return;
    const cr = containerEl.getBoundingClientRect();
    const mx = e.clientX - cr.left + containerEl.scrollLeft;
    const my = e.clientY - cr.top + containerEl.scrollTop;
    const ddx = mx - dragState.startX;
    const ddy = my - dragState.startY;

    if (!pathOffsets[dragState.key]) {
      pathOffsets[dragState.key] = { cp1: {dx:0,dy:0}, cp2: {dx:0,dy:0} };
    }
    pathOffsets[dragState.key][dragState.which] = {
      dx: dragState.origOff.dx + ddx,
      dy: dragState.origOff.dy + ddy,
    };

    const d = buildPath(dragState.fromId, dragState.toId);
    if (pathEls[dragState.key]) pathEls[dragState.key].setAttribute('d', d);
    if (hitEls[dragState.key]) hitEls[dragState.key].setAttribute('d', d);
  });

  window.addEventListener('mouseup', () => {
    if (dragState) {
      const hit = hitEls[dragState.key];
      if (hit) hit.classList.remove('dragging');
      dragState = null;
    }
  });
}

function toggleChain(chainId) {
  if (activeChain === chainId) {
    resetChain();
    return;
  }
  selectChain(chainId);
}

function selectChain(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) return;

  stopAnimation();
  activeChain = chainId;

  const nameEl = document.getElementById('chain-name');
  nameEl.textContent = chain.name;
  nameEl.style.display = 'inline';

  const chainFns = new Set();
  chain.edges.forEach(e => { chainFns.add(e.from); chainFns.add(e.to); });

  const chainEdgeKeys = new Set();
  chain.edges.forEach(e => chainEdgeKeys.add(`${e.from}|${e.to}`));

  for (const [fnId, el] of Object.entries(pillEls)) {
    el.classList.remove('highlighted', 'dimmed', 'pulse');
    if (chainFns.has(fnId)) {
      el.classList.add('highlighted');
    } else {
      el.classList.add('dimmed');
    }
  }

  document.querySelectorAll('.lane[data-lane]').forEach(laneEl => {
    const laneId = laneEl.dataset.lane;
    const lane = LANES.find(l => l.id === laneId);
    if (!lane) return;
    const hasActive = lane.modules.some(modId =>
      [...chainFns].some(f => f.startsWith(modId + ':'))
    );
    laneEl.classList.toggle('dimmed', !hasActive);
  });

  for (const [key, path] of Object.entries(pathEls)) {
    path.classList.remove('active', 'dimmed');
    if (chainEdgeKeys.has(key)) {
      path.classList.add('active');
    } else {
      path.classList.add('dimmed');
    }
  }

  document.querySelectorAll('.entry-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.chain === chainId);
  });

  animateChain(chainId);
}

function resetChain() {
  stopAnimation();
  activeChain = null;

  document.getElementById('chain-name').style.display = 'none';

  for (const el of Object.values(pillEls)) {
    el.classList.remove('highlighted', 'dimmed', 'pulse');
  }
  document.querySelectorAll('.lane[data-lane]').forEach(l => l.classList.remove('dimmed'));

  for (const path of Object.values(pathEls)) {
    path.classList.remove('active', 'dimmed');
  }
  document.querySelectorAll('.entry-chip').forEach(c => c.classList.remove('active'));
}

function createGlowDot(type, parentSvg) {
  const TRAIL_COUNT = 4;
  const dots = [];
  for (let i = TRAIL_COUNT; i >= 0; i--) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const isHead = i === 0;
    c.setAttribute('r', isHead ? 3.5 : Math.max(1.5, 3.5 - i * 0.6));
    c.setAttribute('cx', -20); c.setAttribute('cy', -20);
    c.classList.add(type === 'implements' ? 'glow-implements' : 'glow-dependency');
    c.style.opacity = isHead ? 1 : Math.max(0.15, 1 - i * 0.22);
    parentSvg.appendChild(c);
    dots.push(c);
  }
  return dots;
}

function removeDots(dots) {
  dots.forEach(d => d.remove());
}

function positionDots(dots, positions) {
  dots.forEach((d, i) => {
    const p = positions[Math.min(i, positions.length - 1)];
    if (p) { d.setAttribute('cx', p.x); d.setAttribute('cy', p.y); }
  });
}

function animateChain(chainId) {
  const chain = CHAINS[chainId];
  if (!chain) return;

  const allEdges = chain.edges;
  const allPaths = allEdges.map(e => pathEls[`${e.from}|${e.to}`]).filter(Boolean);

  if (allPaths.length === 0) return;

  const dots = createGlowDot('dependency', svgEl);
  glowDots = [...dots];

  let idx = 0;
  let progress = 0;
  const TRAIL_SPACING = 8;
  const history = [];

  animating = true;

  function frame() {
    if (!animating) return;

    const path = allPaths[idx];
    const len = path.getTotalLength();
    progress += 2.5 * animSpeed;
    if (progress >= len) {
      progress = 0;
      const edge = allEdges.filter(e => pathEls[`${e.from}|${e.to}`])[idx];
      if (edge) {
        const el = pillEls[edge.to];
        if (el) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
      }
      idx = (idx + 1) % allPaths.length;
    }
    const pt = path.getPointAtLength(progress);
    history.unshift(pt);
    if (history.length > dots.length * TRAIL_SPACING) history.length = dots.length * TRAIL_SPACING;
    const positions = dots.map((_, i) => history[Math.min(i * TRAIL_SPACING, history.length - 1)]);
    positionDots(dots, positions);

    animFrame = requestAnimationFrame(frame);
  }
  animFrame = requestAnimationFrame(frame);
}

function stopAnimation() {
  animating = false;
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  glowDots.forEach(d => d.remove());
  glowDots = [];
}

function setSpeed(s) {
  animSpeed = s;
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent) === s);
  });
}

let legendOpen = false;
function toggleLegend() {
  legendOpen = !legendOpen;
  document.getElementById('legend-overlay').classList.toggle('open', legendOpen);
  document.getElementById('legend-btn').classList.toggle('active', legendOpen);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (openPopover) closePopover();
    else if (legendOpen) toggleLegend();
    else if (activeChain) resetChain();
  }
});

document.addEventListener('mousedown', e => {
  if (openPopover && !openPopover.contains(e.target) && !e.target.closest('.fn-info-btn')) {
    closePopover();
  }
});

let resizeTimer;
function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const wasChain = activeChain;
    stopAnimation();
    for (const k of Object.keys(pathEls)) delete pathEls[k];
    buildAllPaths();
    if (wasChain) selectChain(wasChain);
  }, 200);
}

function init() {
  containerEl = document.getElementById('swim-container');
  buildHeader();
  buildLanes();
  buildEntryBar();

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      buildAllPaths();
    });
  });

  window.addEventListener('resize', handleResize);

  let scrollTimer;
  document.getElementById('main').addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const wasChain = activeChain;
      stopAnimation();
      for (const k of Object.keys(pathEls)) delete pathEls[k];
      buildAllPaths();
      if (wasChain) selectChain(wasChain);
    }, 150);
  });
}

document.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>
```

## Quality Checklist

Before outputting the final file, verify:

- [ ] Every module in MODULES appears in exactly one lane's `modules[]` array
- [ ] Every function id in MODULE_FUNCTIONS uses the format `"moduleId:functionName"`
- [ ] Every edge references function ids that exist in MODULE_FUNCTIONS
- [ ] Every `entry: true` function that has a matching CHAINS key appears in the entry bar
- [ ] Lanes are ordered by dependency flow direction (entry points left, terminal dependencies right)
- [ ] >80% of edges connect modules in the same lane or adjacent lanes
- [ ] No lane exists with a single small module that could be merged into a neighbor
- [ ] At least 8 meaningful chains covering: all entry happy paths, startup, shutdown, error/recovery
- [ ] A dedicated "Interface Registration" chain exists with `type: 'implements'` edges showing which modules implement which interfaces
- [ ] Execution chains route through interface types (e.g., `caller → Interface`) instead of calling concrete implementations directly, wherever the code uses dependency inversion
- [ ] The Types/Interfaces module contains all shared abstractions (interfaces, DTOs, callback types, config types)
- [ ] Legend module colors match the actual MODULES colors
- [ ] No duplicate edge keys (`from|to`) within a single chain
- [ ] The `<title>` and `<h1>` contain the actual project name
- [ ] Functions have meaningful `desc` values (not just the function signature)

## Tips for High-Quality Output

1. **Read actual source code** — don't guess at function signatures or dependencies. Read imports, constructor params, and call sites.
2. **Trace real execution flows** — follow actual code paths from entry points through the system. Don't invent connections.
3. **Identify the dependency direction** — A depends on B means A imports/calls B, not the reverse.
4. **Look for interface abstractions** — anywhere a module accepts a callback, interface, or abstract type, that's an `implements` relationship worth showing.
5. **Keep functions focused** — show 3–8 key functions per module, not every method. Focus on public API and important internal functions.
6. **Name chains after user-visible actions** — "User Login", "Send Message", "API Request", not "Function A calls Function B".
7. **Lanes follow flow, not folders** — the lane structure should mirror how a request/event travels through the system. If you find yourself naming a lane after a package directory, rethink.
8. **Maximize adjacent-lane connections** — after assigning lanes, count how many edges cross 2+ lanes. If >20%, reassign modules to reduce crossing distance.
9. **Cover all major paths** — aim for 8+ chains covering: every entry point's happy path, startup, shutdown, error/recovery, and at least one interface-registration chain. More chains = richer interactive exploration.
10. **Pair tightly-coupled modules** — use `layout[]` nested arrays to place modules that frequently call each other side-by-side within a lane, reducing visual clutter.
