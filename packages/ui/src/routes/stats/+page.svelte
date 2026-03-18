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
    { value: "24h", label: "最近 24h" },
    { value: "7d", label: "最近 7天" },
    { value: "all", label: "全部" },
  ];

  const PLATFORM_ICONS: Record<string, string> = {
    discord: "🟣",
    lark: "🔵",
    web: "🟢",
  };

  const PLATFORM_BADGE_CLASS: Record<string, string> = {
    discord: "bg-purple-600 text-white border-transparent",
    lark: "bg-blue-500 text-white border-transparent",
    web: "bg-green-500 text-white border-transparent",
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

<div class="p-8 overflow-y-auto h-full max-w-4xl">
  <h1 class="text-xl font-semibold text-[var(--accent)] mb-6">Token Statistics</h1>

  {#if error}
    <div class="bg-red-950 border border-red-400 text-red-400 rounded-md px-4 py-2.5 mb-4 text-sm">
      {error}
    </div>
  {/if}

  <Tabs.Root bind:value={activeWindow} class="w-full">
    <Tabs.List class="mb-6 w-fit">
      {#each WINDOWS as w}
        <Tabs.Trigger value={w.value} onclick={() => { activeWindow = w.value; }}>
          {w.label}
        </Tabs.Trigger>
      {/each}
    </Tabs.List>

    {#each WINDOWS as w}
      <Tabs.Content value={w.value}>
        {#if loading}
          <p class="text-muted-foreground text-sm italic">Loading statistics…</p>
        {:else if data}
          <!-- Summary Cards -->
          <div class="grid grid-cols-3 gap-4 mb-7">
            <Card.Root class="border-[var(--accent)]">
              <Card.Header class="pb-2">
                <Card.Title class="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Input Tokens
                </Card.Title>
              </Card.Header>
              <Card.Content>
                <div class="text-3xl font-bold text-[var(--accent)]">{fmt(data.total.input)}</div>
                <div class="text-xs text-muted-foreground mt-1">{fmtFull(data.total.input)}</div>
              </Card.Content>
            </Card.Root>

            <Card.Root class="border-[var(--accent)]">
              <Card.Header class="pb-2">
                <Card.Title class="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Output Tokens
                </Card.Title>
              </Card.Header>
              <Card.Content>
                <div class="text-3xl font-bold text-[var(--accent)]">{fmt(data.total.output)}</div>
                <div class="text-xs text-muted-foreground mt-1">{fmtFull(data.total.output)}</div>
              </Card.Content>
            </Card.Root>

            <Card.Root class="opacity-70">
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
              {#each data.projects as proj}
                <Accordion.Item value={proj.name} class="border rounded-lg bg-[var(--bg-sidebar)] overflow-hidden">
                  <Accordion.Trigger class="flex items-center gap-2.5 w-full px-4 py-3.5 text-sm font-semibold hover:no-underline">
                    <span class="font-semibold text-[var(--accent)]">{proj.name}</span>
                    <span class="ml-auto text-xs text-muted-foreground font-normal">
                      in: {fmt(proj.total.input)} / out: {fmt(proj.total.output)}
                    </span>
                  </Accordion.Trigger>
                  <Accordion.Content class="px-4 pb-3.5">
                    <Table.Root>
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
                            <Table.Cell class="font-mono text-xs">
                              {sess.name ?? sess.sessionId.slice(0, 12)}
                            </Table.Cell>
                            <Table.Cell class="font-mono text-xs text-muted-foreground">
                              {fmtTime(sess.createdAt)}
                            </Table.Cell>
                            <Table.Cell class="text-right tabular-nums">
                              {fmt(sess.total.input)}
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
      </Tabs.Content>
    {/each}
  </Tabs.Root>
</div>
