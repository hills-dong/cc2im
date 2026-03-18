<script lang="ts">
  import { onMount } from 'svelte';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import { connect } from '$lib/stores/connection';
  import '../app.css';

  let { children } = $props();
  let isTauri = $state(false);

  onMount(() => {
    isTauri = '__TAURI__' in window;
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    connect(`${wsProto}://${location.host}/ws`);
  });
</script>

<ModeWatcher />
<Toaster />

<div class="flex flex-col h-screen">
  {#if isTauri}
    <div class="h-8 bg-sidebar flex items-center px-3 text-xs text-sidebar-foreground" data-tauri-drag-region>
      <span class="font-semibold">cc2im</span>
      <div class="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  {/if}

  <div class="flex flex-1 overflow-hidden">
    <!-- Sidebar will be added in Task 5 -->
    <main class="flex-1 flex flex-col overflow-hidden">
      {@render children()}
    </main>
  </div>

  <StatusBar />
</div>
