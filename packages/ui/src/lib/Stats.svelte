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
    const _w = activeWindow;
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
