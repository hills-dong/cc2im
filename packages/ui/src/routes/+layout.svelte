<script lang="ts">
  import { onMount } from 'svelte';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import { SidebarProvider } from '$lib/components/ui/sidebar/index.js';
  import { connect } from '$lib/stores/connection';
  import Onboarding from '$lib/Onboarding.svelte';
  import '../app.css';

  let { children } = $props();
  let isTauri = $state(false);
  let showOnboarding = $state(false);

  onMount(async () => {
    isTauri = '__TAURI__' in window;
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    connect(`${wsProto}://${location.host}/ws`);

    // Check if onboarding is needed
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
<Toaster />

<div class="flex flex-col h-screen">
  {#if isTauri}
    <div class="h-8 bg-sidebar flex items-center px-3 text-xs text-sidebar-foreground" data-tauri-drag-region>
      <span class="font-semibold">cc2im</span>
    </div>
  {/if}

  <SidebarProvider class="flex flex-1 overflow-hidden min-h-0">
    <AppSidebar />
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="flex h-10 items-center gap-2 border-b border-border px-4">
        <div class="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main class="flex-1 flex flex-col overflow-hidden">
        {@render children()}
      </main>
      <StatusBar />
    </div>
  </SidebarProvider>
</div>

<Onboarding bind:open={showOnboarding} />
