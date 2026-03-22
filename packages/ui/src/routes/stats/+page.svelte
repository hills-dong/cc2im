<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Accordion from "$lib/components/ui/accordion/index.js";
  import * as Table from "$lib/components/ui/table/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";

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

  const WINDOWS: { value: WindowParam; label: string }[] = [
    { value: "24h", label: "Last 24h" },
    { value: "7d", label: "Last 7 days" },
    { value: "all", label: "All time" },
  ];

  const PLATFORM_ICONS: Record<string, string> = {
    discord: "🟣",
    lark: "🔵",
    web: "🟢",
  };

  const PLATFORM_BADGE_CLASS: Record<string, string> = {
    discord: "bg-secondary text-secondary-foreground border-transparent",
    lark: "bg-secondary text-secondary-foreground border-transparent",
    web: "bg-secondary text-secondary-foreground border-transparent",
  };

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  function fmtFull(n: number): string {
    return n.toLocaleString();
  }

  function effectiveInput(t: TokenTotals): number {
    return Math.round(t.input + t.cacheCreation * 1.25 + t.cacheRead * 0.1);
  }

  function effectiveInputTooltip(t: TokenTotals): string {
    return `${fmtFull(t.input)} + ${fmtFull(t.cacheCreation)} × 1.25 + ${fmtFull(t.cacheRead)} × 0.1`;
  }

  function fmtTime(iso: string | null): string {
    if (!iso) return "—";
    // SQLite CURRENT_TIMESTAMP is UTC but lacks 'T'/'Z'; normalize so Date parses as UTC
    const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
    const d = new Date(normalized);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function platformIcon(p: string | null): string {
    return p ? PLATFORM_ICONS[p] ?? "⚪" : "⚪";
  }

  function platformBadgeClass(p: string | null): string {
    return p ? PLATFORM_BADGE_CLASS[p] ?? "bg-muted text-muted-foreground border-transparent" : "bg-muted text-muted-foreground border-transparent";
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

<div class="flex-1 overflow-auto p-6">
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Page header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Token Statistics</h1>
      <Tabs.Root bind:value={activeWindow}>
        <Tabs.List>
          {#each WINDOWS as w}
            <Tabs.Trigger value={w.value} onclick={() => { activeWindow = w.value; }}>
              {w.label}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>
    </div>

    {#if error}
      <div class="bg-destructive/10 border border-destructive text-destructive rounded-md px-4 py-2.5 text-sm">
        {error}
      </div>
    {/if}

    {#if loading}
      <p class="text-muted-foreground text-sm italic">Loading statistics…</p>
    {:else if data}
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card.Root class="animate-fade-up">
          <Card.Header class="pb-2">
            <Card.Title class="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Input Tokens
            </Card.Title>
          </Card.Header>
          <Card.Content title={effectiveInputTooltip(data.total)}>
            <div class="text-3xl font-bold tabular-nums">{fmt(effectiveInput(data.total))}</div>
            <div class="text-xs text-muted-foreground mt-1">{fmtFull(effectiveInput(data.total))}</div>
          </Card.Content>
        </Card.Root>

        <Card.Root class="animate-fade-up" style="animation-delay: 80ms">
          <Card.Header class="pb-2">
            <Card.Title class="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Output Tokens
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <div class="text-3xl font-bold tabular-nums">{fmt(data.total.output)}</div>
            <div class="text-xs text-muted-foreground mt-1">{fmtFull(data.total.output)}</div>
          </Card.Content>
        </Card.Root>

        <Card.Root class="animate-fade-up opacity-70" style="animation-delay: 160ms">
          <Card.Header class="pb-2">
            <Card.Title class="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Cache (read / create)
            </Card.Title>
          </Card.Header>
          <Card.Content>
            <div class="text-xl font-semibold text-muted-foreground">
              {fmt(data.total.cacheRead)} / {fmt(data.total.cacheCreation)}
            </div>
            <div class="text-xs text-muted-foreground mt-1">
              {fmtFull(data.total.cacheRead)} / {fmtFull(data.total.cacheCreation)}
            </div>
          </Card.Content>
        </Card.Root>
      </div>

      <!-- Project list -->
      {#if data.projects.length === 0}
        <p class="text-muted-foreground italic text-sm py-5">
          No token usage data in this time window.
        </p>
      {:else}
        <Accordion.Root type="multiple" class="space-y-3">
          {#each data.projects as proj, i}
            <Accordion.Item value={proj.name} class="!border rounded-lg overflow-hidden animate-fade-up" style="animation-delay: {240 + i * 60}ms">
              <Accordion.Trigger class="flex items-center gap-2.5 w-full px-4 py-3.5 text-sm font-semibold hover:no-underline">
                <span class="font-semibold">{proj.name}</span>
                <span class="ml-auto text-xs text-muted-foreground font-normal" title={effectiveInputTooltip(proj.total)}>
                  in: {fmt(effectiveInput(proj.total))} / out: {fmt(proj.total.output)}
                </span>
              </Accordion.Trigger>
              <Accordion.Content class="px-4 pb-3.5 [&_[data-slot=table-container]]:overflow-hidden">
                <Table.Root class="table-fixed w-full">
                  <Table.Header>
                    <Table.Row>
                      <Table.Head class="w-28 text-xs uppercase tracking-wider">Platform</Table.Head>
                      <Table.Head class="text-xs uppercase tracking-wider">Session</Table.Head>
                      <Table.Head class="w-28 text-xs uppercase tracking-wider">Time</Table.Head>
                      <Table.Head class="w-20 text-right text-xs uppercase tracking-wider">In</Table.Head>
                      <Table.Head class="w-20 text-right text-xs uppercase tracking-wider">Out</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {#each proj.sessions as sess}
                      <Table.Row>
                        <Table.Cell>
                          <Badge
                            variant="outline"
                            class={platformBadgeClass(sess.platform)}
                          >
                            {platformIcon(sess.platform)} {sess.platform ?? "unknown"}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell class="font-mono text-xs max-w-[180px] truncate" title={sess.name ?? sess.sessionId.slice(0, 12)}>
                          {sess.name ?? sess.sessionId.slice(0, 12)}
                        </Table.Cell>
                        <Table.Cell class="font-mono text-xs text-muted-foreground">
                          {fmtTime(sess.createdAt)}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums" title={effectiveInputTooltip(sess.total)}>
                          {fmt(effectiveInput(sess.total))}
                        </Table.Cell>
                        <Table.Cell class="text-right tabular-nums">
                          {fmt(sess.total.output)}
                        </Table.Cell>
                      </Table.Row>
                    {/each}
                  </Table.Body>
                </Table.Root>
              </Accordion.Content>
            </Accordion.Item>
          {/each}
        </Accordion.Root>
      {/if}
    {/if}
  </div>
</div>
