<script lang="ts">
  import { onMount } from "svelte";
  import { connect } from "./lib/stores/connection.js";
  import { connectionStatus } from "./lib/stores/connection.js";
  import { currentProject, currentSessionId } from "./lib/stores/chat.js";
  import Sidebar from "./lib/Sidebar.svelte";
  import Chat from "./lib/Chat.svelte";
  import Config from "./lib/Config.svelte";
  import Stats from "./lib/Stats.svelte";
  import Onboarding from "./lib/Onboarding.svelte";

  const isDesktop = "__TAURI__" in window;

  let currentPage = $state<"chat" | "config" | "stats">("chat");
  let showOnboarding = $state(false);
  let onboardingChecked = $state(false);

  onMount(async () => {
    connect(`ws://${location.host}/ws`);
    await checkOnboarding();
  });

  async function checkOnboarding() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const projects = Array.isArray(data) ? data : [];
        if (projects.length === 0) {
          showOnboarding = true;
        }
      }
    } catch {
      // If the endpoint fails, don't show onboarding
    } finally {
      onboardingChecked = true;
    }
  }

  async function handleOnboardingComplete(result: {
    claudeCommand: string;
    projectName: string;
    projectDirectory: string;
    discordToken: string;
    larkAppId: string;
    larkAppSecret: string;
  }) {
    // Save project via API
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: result.projectName,
          directory: result.projectDirectory,
        }),
      });
    } catch {
      // proceed anyway
    }

    // Save config with claude command and platform tokens
    try {
      const cfgRes = await fetch("/api/config");
      const cfg = cfgRes.ok ? await cfgRes.json() : {};
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cfg,
          claude: { ...cfg.claude, command: result.claudeCommand },
          discord: result.discordToken ? { token: result.discordToken } : cfg.discord,
          lark:
            result.larkAppId
              ? { appId: result.larkAppId, appSecret: result.larkAppSecret }
              : cfg.lark,
        }),
      });
    } catch {
      // proceed anyway
    }

    showOnboarding = false;
    currentPage = "chat";
  }

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
        <Config />
      {:else if currentPage === "stats"}
        <Stats />
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

  {#if showOnboarding && onboardingChecked}
    <Onboarding onComplete={handleOnboardingComplete} />
  {/if}
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
</style>
