<script lang="ts">
  import { onMount } from "svelte";

  interface DailyRow {
    date: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
  }

  interface TokenStats {
    totalInput: number;
    totalOutput: number;
    totalCache: number;
    daily: DailyRow[];
  }

  let projects = $state<string[]>([]);
  let selectedProject = $state("");
  let stats = $state<TokenStats | null>(null);
  let loadingProjects = $state(true);
  let loadingStats = $state(false);
  let error = $state("");

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  function fmtFull(n: number): string {
    return n.toLocaleString();
  }

  async function loadProjects() {
    loadingProjects = true;
    error = "";
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // Accept array of strings or array of objects with .name
      projects = Array.isArray(data)
        ? data.map((p: unknown) => (typeof p === "string" ? p : (p as { name: string }).name))
        : [];
    } catch (e) {
      error = "Failed to load projects: " + String(e);
    } finally {
      loadingProjects = false;
    }
  }

  async function loadStats() {
    if (!selectedProject) return;
    loadingStats = true;
    error = "";
    stats = null;
    try {
      const res = await fetch(`/api/stats/tokens?project=${encodeURIComponent(selectedProject)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      stats = await res.json();
    } catch (e) {
      error = "Failed to load stats: " + String(e);
    } finally {
      loadingStats = false;
    }
  }

  $effect(() => {
    if (selectedProject) {
      loadStats();
    }
  });

  // Bar chart helpers
  const CHART_HEIGHT = 120;
  const BAR_WIDTH = 24;
  const BAR_GAP = 8;

  function chartData(daily: DailyRow[]) {
    const maxTotal = Math.max(
      1,
      ...daily.map((d) => d.inputTokens + d.outputTokens + d.cacheTokens)
    );
    return daily.slice(-20).map((d) => ({
      ...d,
      total: d.inputTokens + d.outputTokens + d.cacheTokens,
      height: Math.round(((d.inputTokens + d.outputTokens + d.cacheTokens) / maxTotal) * CHART_HEIGHT),
      inputH: Math.round((d.inputTokens / maxTotal) * CHART_HEIGHT),
      outputH: Math.round((d.outputTokens / maxTotal) * CHART_HEIGHT),
      cacheH: Math.round((d.cacheTokens / maxTotal) * CHART_HEIGHT),
    }));
  }

  onMount(loadProjects);
</script>

<div class="stats-page">
  <div class="page-header">
    <h1>Token Statistics</h1>
  </div>

  {#if error}
    <div class="error-msg">{error}</div>
  {/if}

  <div class="filter-row">
    <label for="project-select">Project</label>
    {#if loadingProjects}
      <span class="loading-text">Loading projects…</span>
    {:else}
      <select id="project-select" bind:value={selectedProject}>
        <option value="">— Select a project —</option>
        {#each projects as p}
          <option value={p}>{p}</option>
        {/each}
      </select>
    {/if}
  </div>

  {#if loadingStats}
    <div class="loading-text">Loading statistics…</div>
  {:else if stats}
    <!-- Summary cards -->
    <div class="summary-cards">
      <div class="card">
        <div class="card-label">Input Tokens</div>
        <div class="card-value">{fmt(stats.totalInput)}</div>
        <div class="card-sub">{fmtFull(stats.totalInput)}</div>
      </div>
      <div class="card">
        <div class="card-label">Output Tokens</div>
        <div class="card-value">{fmt(stats.totalOutput)}</div>
        <div class="card-sub">{fmtFull(stats.totalOutput)}</div>
      </div>
      <div class="card">
        <div class="card-label">Cache Tokens</div>
        <div class="card-value">{fmt(stats.totalCache)}</div>
        <div class="card-sub">{fmtFull(stats.totalCache)}</div>
      </div>
      <div class="card total">
        <div class="card-label">Total</div>
        <div class="card-value">{fmt(stats.totalInput + stats.totalOutput + stats.totalCache)}</div>
        <div class="card-sub">{fmtFull(stats.totalInput + stats.totalOutput + stats.totalCache)}</div>
      </div>
    </div>

    {#if stats.daily && stats.daily.length > 0}
      <!-- SVG Bar Chart -->
      <div class="chart-section">
        <h2>Daily Usage (last {Math.min(stats.daily.length, 20)} days)</h2>
        <div class="chart-legend">
          <span class="legend-item input">Input</span>
          <span class="legend-item output">Output</span>
          <span class="legend-item cache">Cache</span>
        </div>
        <div class="chart-wrap">
          {#each [chartData(stats.daily)] as cd}
          <svg
            width={cd.length * (BAR_WIDTH + BAR_GAP)}
            height={CHART_HEIGHT + 36}
            class="bar-chart"
          >
            {#each cd as bar, i}
              {@const x = i * (BAR_WIDTH + BAR_GAP)}
              {@const y0 = CHART_HEIGHT - bar.inputH}
              {@const y1 = CHART_HEIGHT - bar.inputH - bar.outputH}
              {@const y2 = CHART_HEIGHT - bar.inputH - bar.outputH - bar.cacheH}
              <!-- Input bar (bottom) -->
              {#if bar.inputH > 0}
                <rect x={x} y={y0} width={BAR_WIDTH} height={bar.inputH} fill="#4cc9f0" opacity="0.85" rx="2" />
              {/if}
              <!-- Output bar (middle) -->
              {#if bar.outputH > 0}
                <rect x={x} y={y1} width={BAR_WIDTH} height={bar.outputH} fill="#a78bfa" opacity="0.85" rx="2" />
              {/if}
              <!-- Cache bar (top) -->
              {#if bar.cacheH > 0}
                <rect x={x} y={y2} width={BAR_WIDTH} height={bar.cacheH} fill="#34d399" opacity="0.7" rx="2" />
              {/if}
              <!-- Date label -->
              <text
                x={x + BAR_WIDTH / 2}
                y={CHART_HEIGHT + 20}
                text-anchor="middle"
                font-size="9"
                fill="#a0a0b0"
              >
                {bar.date.slice(5)}
              </text>
            {/each}
          </svg>
          {/each}
        </div>
      </div>

      <!-- Daily table -->
      <div class="table-section">
        <h2>Daily Breakdown</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Model</th>
                <th>Input</th>
                <th>Output</th>
                <th>Cache</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {#each [...stats.daily].reverse() as row}
                <tr>
                  <td class="mono">{row.date}</td>
                  <td class="mono dimmed">{row.model || "—"}</td>
                  <td class="num">{fmtFull(row.inputTokens)}</td>
                  <td class="num">{fmtFull(row.outputTokens)}</td>
                  <td class="num">{fmtFull(row.cacheTokens)}</td>
                  <td class="num total">{fmtFull(row.inputTokens + row.outputTokens + row.cacheTokens)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {:else}
      <div class="empty-hint">No daily data available for this project.</div>
    {/if}
  {:else if selectedProject && !loadingStats}
    <div class="empty-hint">No statistics found.</div>
  {:else if !selectedProject && !loadingProjects}
    <div class="empty-hint">Select a project to view token usage.</div>
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

  .filter-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 28px;
  }

  .filter-row label {
    font-size: 12px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  select {
    background: #0f3460;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 7px 12px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    cursor: pointer;
    min-width: 200px;
  }

  select:focus {
    border-color: var(--accent);
  }

  .loading-text {
    color: var(--text-secondary);
    font-size: 13px;
    font-style: italic;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 32px;
  }

  .card {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 20px;
  }

  .card.total {
    border-color: var(--accent);
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

  .card-sub {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 3px;
  }

  .chart-section {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
    margin-bottom: 24px;
  }

  .chart-section h2,
  .table-section h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 12px;
  }

  .chart-legend {
    display: flex;
    gap: 16px;
    margin-bottom: 14px;
  }

  .legend-item {
    font-size: 11px;
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-secondary);
  }

  .legend-item::before {
    content: "";
    display: inline-block;
    width: 12px;
    height: 10px;
    border-radius: 2px;
  }

  .legend-item.input::before { background: #4cc9f0; }
  .legend-item.output::before { background: #a78bfa; }
  .legend-item.cache::before { background: #34d399; }

  .chart-wrap {
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .bar-chart {
    display: block;
  }

  .table-section {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
    margin-bottom: 32px;
  }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  thead th {
    text-align: left;
    padding: 8px 12px;
    color: var(--text-secondary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--border);
  }

  tbody tr {
    border-bottom: 1px solid rgba(42, 42, 78, 0.5);
    transition: background 0.1s;
  }

  tbody tr:hover {
    background: rgba(76, 201, 240, 0.04);
  }

  tbody td {
    padding: 9px 12px;
    color: var(--text-primary);
  }

  .mono {
    font-family: monospace;
    font-size: 12px;
  }

  .dimmed {
    color: var(--text-secondary);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .num.total {
    color: var(--accent);
    font-weight: 600;
  }

  .empty-hint {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 13px;
    padding: 20px 0;
  }
</style>
