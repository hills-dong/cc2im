<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import { SidebarProvider } from '$lib/components/ui/sidebar/index.js';
  import { connect } from '$lib/stores/connection';
  import { sessions } from '$lib/stores/chat';
  import Onboarding from '$lib/Onboarding.svelte';
  import '../app.css';

  let { children } = $props();
  let isTauri = $state(false);
  let showOnboarding = $state(false);

  // Derive current session tokens for StatusBar
  let currentSessionId = $derived($page.params.session ?? '');
  let currentSession = $derived(currentSessionId ? $sessions.get(currentSessionId) : undefined);
  let msgInputTokens = $derived(
    (currentSession?.messages ?? []).reduce((sum, m) => sum + (m.tokens?.input ?? 0), 0)
  );
  let msgOutputTokens = $derived(
    (currentSession?.messages ?? []).reduce((sum, m) => sum + (m.tokens?.output ?? 0), 0)
  );
  // For historical sessions, per-message data may be incomplete; fall back to session-level totals
  let sessionInputTokens = $derived(
    msgInputTokens || currentSession?.baseInputTokens || 0
  );
  let sessionOutputTokens = $derived(
    msgOutputTokens || currentSession?.baseOutputTokens || 0
  );
  let msgCacheRead = $derived(
    (currentSession?.messages ?? []).reduce((sum, m) => sum + (m.tokens?.cacheRead ?? 0), 0)
  );
  let msgCacheCreation = $derived(
    (currentSession?.messages ?? []).reduce((sum, m) => sum + (m.tokens?.cacheCreation ?? 0), 0)
  );
  // For historical sessions, per-message cache data is unavailable; fall back to session-level totals
  let sessionCacheReadTokens = $derived(
    msgCacheRead || currentSession?.baseCacheReadTokens || 0
  );
  let sessionCacheCreationTokens = $derived(
    msgCacheCreation || currentSession?.baseCacheCreationTokens || 0
  );

  // Resizable sidebar
  const MIN_WIDTH = 180;
  const MAX_WIDTH = 400;
  const DEFAULT_WIDTH = 256;
  let sidebarWidth = $state(DEFAULT_WIDTH);
  let isDragging = $state(false);

  function onPointerDown(e: PointerEvent) {
    isDragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    sidebarWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
  }

  function onPointerUp() {
    isDragging = false;
  }

  // H3 fix: keyboard support for resize handle
  const RESIZE_STEP = 20;
  function onResizeKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft') {
      sidebarWidth = Math.max(MIN_WIDTH, sidebarWidth - RESIZE_STEP);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      sidebarWidth = Math.min(MAX_WIDTH, sidebarWidth + RESIZE_STEP);
      e.preventDefault();
    } else if (e.key === 'Home') {
      sidebarWidth = MIN_WIDTH;
      e.preventDefault();
    } else if (e.key === 'End') {
      sidebarWidth = MAX_WIDTH;
      e.preventDefault();
    }
  }

  onMount(async () => {
    isTauri = '__TAURI__' in window;
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    connect(`${wsProto}://${location.host}/ws`);

    try {
      const res = await fetch('/api/projects');
      const projects = await res.json();
      if (!projects || projects.length === 0) {
        showOnboarding = true;
      }
    } catch {
      showOnboarding = true;
    }
  });
</script>

<ModeWatcher defaultMode="dark" />
<Toaster position="top-right" />

<div class="flex flex-col h-screen" class:select-none={isDragging}>
  {#if isTauri}
    <div class="h-8 bg-sidebar flex items-center px-3 text-xs text-sidebar-foreground" data-tauri-drag-region>
      <span class="font-semibold">cc2im</span>
    </div>
  {/if}

  <SidebarProvider class="flex flex-1 overflow-hidden min-h-0">
    <div class="flex-shrink-0 overflow-x-hidden overflow-y-auto" style="width: {sidebarWidth}px; --sidebar-width: {sidebarWidth}px">
      <AppSidebar />
    </div>

    <!-- Resize handle (H3 fix: keyboard accessible) -->
    <div
      class="flex-shrink-0 w-1 cursor-col-resize transition-colors hover:bg-primary/20 focus-visible:bg-primary/30 focus-visible:outline-none {isDragging ? 'bg-primary/30' : ''}"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={sidebarWidth}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      aria-label="Resize sidebar"
      tabindex="0"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onkeydown={onResizeKeydown}
    ></div>

    <div class="flex-1 flex flex-col overflow-hidden min-w-0">
      <header class="flex h-10 items-center gap-2 border-b border-border px-4">
        <div class="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main class="flex-1 flex flex-col overflow-hidden">
        {@render children()}
      </main>
      <StatusBar inputTokens={sessionInputTokens} outputTokens={sessionOutputTokens} cacheReadTokens={sessionCacheReadTokens} cacheCreationTokens={sessionCacheCreationTokens} />
    </div>
  </SidebarProvider>
</div>

<Onboarding bind:open={showOnboarding} />
