<script lang="ts">
  import { connectionStatus } from '$lib/stores/connection';

  let {
    inputTokens = 0,
    outputTokens = 0,
    cacheReadTokens = 0,
    cacheCreationTokens = 0,
    contextWindow = 0,
  }: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    contextWindow?: number;
  } = $props();

  let status = $derived($connectionStatus);

  const statusLabels: Record<string, string> = {
    connected: 'Connected',
    connecting: 'Connecting\u2026',
    disconnected: 'Disconnected',
  };

  let label = $derived(statusLabels[status] ?? 'Disconnected');

  let effectiveInput = $derived(
    Math.round(inputTokens + cacheCreationTokens * 1.25 + cacheReadTokens * 0.1)
  );
  let inputTooltip = $derived(
    `${inputTokens.toLocaleString()} + ${cacheCreationTokens.toLocaleString()} × 1.25 + ${cacheReadTokens.toLocaleString()} × 0.1`
  );
  let showTokens = $derived(effectiveInput > 0 || outputTokens > 0);

  function fmt(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }
</script>

<div class="flex items-center gap-2 px-4 py-1 bg-background text-xs text-muted-foreground border-t border-border">
  <span>{label}</span>
  {#if showTokens}
    <span class="ml-auto tabular-nums">
      {#if contextWindow > 0}<span>ctx: {fmt(contextWindow)}</span> · {/if}<span title={inputTooltip}>in: {fmt(effectiveInput)}</span> · out: {fmt(outputTokens)}
    </span>
  {/if}
</div>
