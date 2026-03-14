<script lang="ts">
  import { onMount } from "svelte";
  import { connect } from "./lib/stores/connection.js";
  import { connectionStatus } from "./lib/stores/connection.js";
  import { currentProject, currentSessionId } from "./lib/stores/chat.js";
  import Sidebar from "./lib/Sidebar.svelte";
  import Chat from "./lib/Chat.svelte";

  const isDesktop = "__TAURI__" in window;

  let currentPage = $state<"chat" | "config" | "stats">("chat");

  onMount(() => {
    connect(`ws://${location.host}/ws`);
  });

  function handlePageChange(page: "chat" | "config" | "stats") {
    currentPage = page;
  }

  function handleSessionSelect(project: string, sessionId: string | null) {
    currentProject.set(project);
    currentSessionId.set(sessionId);
    currentPage = "chat";
  }

  $effect(() => {
    // keep reactive reference to stores
    void $connectionStatus;
  });
</script>

<div class="app-shell">
  {#if isDesktop}
    <div class="titlebar" data-tauri-drag-region>
      <span class="titlebar-title">cc2im</span>
    </div>
  {/if}

  <div class="app-body">
    <Sidebar
      {currentPage}
      onPageChange={handlePageChange}
      onSessionSelect={handleSessionSelect}
    />

    <main class="main-content">
      {#if currentPage === "chat"}
        <Chat project={$currentProject} sessionId={$currentSessionId} />
      {:else if currentPage === "config"}
        <div class="placeholder-page">
          <h2>Configuration</h2>
          <p>Config page coming soon.</p>
        </div>
      {:else if currentPage === "stats"}
        <div class="placeholder-page">
          <h2>Statistics</h2>
          <p>Stats page coming soon.</p>
        </div>
      {/if}
    </main>
  </div>

  <div class="status-bar">
    <span class="conn-status" class:connected={$connectionStatus === "connected"} class:connecting={$connectionStatus === "connecting"}>
      {#if $connectionStatus === "connected"}
        ● Connected
      {:else if $connectionStatus === "connecting"}
        ◌ Connecting…
      {:else}
        ○ Disconnected
      {/if}
    </span>
  </div>
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .titlebar {
    height: 32px;
    background: #0d0d1a;
    display: flex;
    align-items: center;
    padding: 0 16px;
    flex-shrink: 0;
    user-select: none;
    -webkit-app-region: drag;
  }

  .titlebar-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    letter-spacing: 0.05em;
  }

  .app-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .status-bar {
    height: 22px;
    background: #0d0d1a;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 12px;
    flex-shrink: 0;
  }

  .conn-status {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .conn-status.connected {
    color: #4ade80;
  }

  .conn-status.connecting {
    color: #facc15;
  }

  .placeholder-page {
    padding: 40px;
    color: var(--text-primary);
  }

  .placeholder-page h2 {
    font-size: 20px;
    margin-bottom: 12px;
    color: var(--accent);
  }

  .placeholder-page p {
    color: var(--text-secondary);
  }
</style>
