<script lang="ts">
  import { onMount } from "svelte";

  interface Project {
    name: string;
    directory: string;
    model?: string;
    platforms?: string[];
  }

  interface Config {
    claude?: {
      command?: string;
      defaultArgs?: string[];
      timeout?: number;
      bufferInterval?: number;
    };
    discord?: {
      token?: string;
    };
    lark?: {
      appId?: string;
      appSecret?: string;
    };
    projects?: Project[];
    formatter?: {
      maxMessageLengthDiscord?: number;
      maxMessageLengthLark?: number;
      maxConcurrentProcesses?: number;
    };
  }

  let config = $state<Config>({});
  let loading = $state(true);
  let saving = $state(false);
  let toast = $state<{ message: string; type: "success" | "error" } | null>(null);

  // Flat editable fields
  let claudeCommand = $state("");
  let claudeDefaultArgs = $state("");
  let claudeTimeout = $state(30000);
  let claudeBufferInterval = $state(100);
  let discordToken = $state("");
  let larkAppId = $state("");
  let larkAppSecret = $state("");
  let formatterMaxDiscord = $state(2000);
  let formatterMaxLark = $state(4096);
  let formatterMaxConcurrent = $state(5);

  let projects = $state<Project[]>([]);
  let showAddProject = $state(false);
  let newProject = $state<Project>({ name: "", directory: "", model: "", platforms: [] });

  function populateFields(cfg: Config) {
    claudeCommand = cfg.claude?.command ?? "";
    claudeDefaultArgs = (cfg.claude?.defaultArgs ?? []).join(", ");
    claudeTimeout = cfg.claude?.timeout ?? 30000;
    claudeBufferInterval = cfg.claude?.bufferInterval ?? 100;
    discordToken = cfg.discord?.token ?? "";
    larkAppId = cfg.lark?.appId ?? "";
    larkAppSecret = cfg.lark?.appSecret ?? "";
    formatterMaxDiscord = cfg.formatter?.maxMessageLengthDiscord ?? 2000;
    formatterMaxLark = cfg.formatter?.maxMessageLengthLark ?? 4096;
    formatterMaxConcurrent = cfg.formatter?.maxConcurrentProcesses ?? 5;
    projects = (cfg.projects ?? []).map((p) => ({
      ...p,
      platforms: p.platforms ?? [],
    }));
  }

  async function loadConfig() {
    loading = true;
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      config = data;
      populateFields(data);
    } catch (e) {
      showToast("Failed to load config: " + String(e), "error");
    } finally {
      loading = false;
    }
  }

  async function saveConfig() {
    saving = true;
    try {
      const updated: Config = {
        ...config,
        claude: {
          command: claudeCommand,
          defaultArgs: claudeDefaultArgs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          timeout: claudeTimeout,
          bufferInterval: claudeBufferInterval,
        },
        discord: { token: discordToken },
        lark: { appId: larkAppId, appSecret: larkAppSecret },
        projects,
        formatter: {
          maxMessageLengthDiscord: formatterMaxDiscord,
          maxMessageLengthLark: formatterMaxLark,
          maxConcurrentProcesses: formatterMaxConcurrent,
        },
      };
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("Config saved successfully", "success");
    } catch (e) {
      showToast("Failed to save config: " + String(e), "error");
    } finally {
      saving = false;
    }
  }

  async function addProject() {
    if (!newProject.name || !newProject.directory) {
      showToast("Project name and directory are required", "error");
      return;
    }
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProject),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      projects = [...projects, { ...newProject, platforms: [...(newProject.platforms ?? [])] }];
      newProject = { name: "", directory: "", model: "", platforms: [] };
      showAddProject = false;
      showToast("Project added", "success");
    } catch (e) {
      showToast("Failed to add project: " + String(e), "error");
    }
  }

  async function deleteProject(name: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      projects = projects.filter((p) => p.name !== name);
      showToast("Project deleted", "success");
    } catch (e) {
      showToast("Failed to delete project: " + String(e), "error");
    }
  }

  function togglePlatform(project: Project, platform: string) {
    const idx = projects.findIndex((p) => p.name === project.name);
    if (idx === -1) return;
    const existing = projects[idx].platforms ?? [];
    if (existing.includes(platform)) {
      projects[idx] = { ...projects[idx], platforms: existing.filter((x) => x !== platform) };
    } else {
      projects[idx] = { ...projects[idx], platforms: [...existing, platform] };
    }
    projects = [...projects];
  }

  function toggleNewPlatform(platform: string) {
    const existing = newProject.platforms ?? [];
    if (existing.includes(platform)) {
      newProject = { ...newProject, platforms: existing.filter((x) => x !== platform) };
    } else {
      newProject = { ...newProject, platforms: [...existing, platform] };
    }
  }

  function showToast(message: string, type: "success" | "error") {
    toast = { message, type };
    setTimeout(() => {
      toast = null;
    }, 3500);
  }

  onMount(loadConfig);
</script>

{#if toast}
  <div class="toast {toast.type}">{toast.message}</div>
{/if}

<div class="config-page">
  <div class="page-header">
    <h1>Configuration</h1>
    <button class="btn-primary" onclick={saveConfig} disabled={saving || loading}>
      {saving ? "Saving…" : "Save Config"}
    </button>
  </div>

  {#if loading}
    <div class="loading">Loading configuration…</div>
  {:else}
    <!-- Claude Settings -->
    <section class="config-section">
      <h2>Claude Settings</h2>
      <div class="form-group">
        <label for="claude-command">Command Path</label>
        <input id="claude-command" type="text" bind:value={claudeCommand} placeholder="claude" />
      </div>
      <div class="form-group">
        <label for="claude-args">Default Args <span class="hint">(comma-separated)</span></label>
        <input id="claude-args" type="text" bind:value={claudeDefaultArgs} placeholder="--dangerously-skip-permissions" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="claude-timeout">Timeout (ms)</label>
          <input id="claude-timeout" type="number" bind:value={claudeTimeout} min="1000" />
        </div>
        <div class="form-group">
          <label for="claude-buffer">Buffer Interval (ms)</label>
          <input id="claude-buffer" type="number" bind:value={claudeBufferInterval} min="10" />
        </div>
      </div>
    </section>

    <!-- Discord -->
    <section class="config-section">
      <h2>Discord</h2>
      <div class="form-group">
        <label for="discord-token">Bot Token</label>
        <input id="discord-token" type="password" bind:value={discordToken} placeholder="••••••••" autocomplete="off" />
      </div>
    </section>

    <!-- Lark -->
    <section class="config-section">
      <h2>Lark / Feishu</h2>
      <div class="form-group">
        <label for="lark-appid">App ID</label>
        <input id="lark-appid" type="text" bind:value={larkAppId} placeholder="cli_xxx" />
      </div>
      <div class="form-group">
        <label for="lark-secret">App Secret</label>
        <input id="lark-secret" type="password" bind:value={larkAppSecret} placeholder="••••••••" autocomplete="off" />
      </div>
    </section>

    <!-- Projects -->
    <section class="config-section">
      <div class="section-header">
        <h2>Projects</h2>
        <button class="btn-secondary" onclick={() => (showAddProject = !showAddProject)}>
          {showAddProject ? "Cancel" : "+ Add Project"}
        </button>
      </div>

      {#if showAddProject}
        <div class="project-form">
          <div class="form-row">
            <div class="form-group">
              <label for="new-proj-name">Name</label>
              <input id="new-proj-name" type="text" bind:value={newProject.name} placeholder="my-project" />
            </div>
            <div class="form-group">
              <label for="new-proj-dir">Directory</label>
              <input id="new-proj-dir" type="text" bind:value={newProject.directory} placeholder="/home/user/project" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="new-proj-model">Model</label>
              <input id="new-proj-model" type="text" bind:value={newProject.model} placeholder="claude-opus-4-5" />
            </div>
            <div class="form-group">
              <label for="new-proj-platforms">Platforms</label>
              <div class="checkbox-group">
                {#each ["discord", "lark"] as platform}
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      checked={(newProject.platforms ?? []).includes(platform)}
                      onchange={() => toggleNewPlatform(platform)}
                    />
                    {platform}
                  </label>
                {/each}
              </div>
            </div>
          </div>
          <button class="btn-primary" onclick={addProject}>Add Project</button>
        </div>
      {/if}

      {#if projects.length === 0}
        <p class="empty-hint">No projects configured.</p>
      {:else}
        <div class="project-list">
          {#each projects as project}
            <div class="project-card">
              <div class="project-info">
                <div class="project-name">{project.name}</div>
                <div class="project-dir">{project.directory}</div>
                <div class="project-meta">
                  {#if project.model}<span class="badge">{project.model}</span>{/if}
                  {#each project.platforms ?? [] as platform}
                    <span class="badge platform">{platform}</span>
                  {/each}
                </div>
              </div>
              <div class="project-actions">
                <div class="checkbox-group inline">
                  {#each ["discord", "lark"] as platform}
                    <label class="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(project.platforms ?? []).includes(platform)}
                        onchange={() => togglePlatform(project, platform)}
                      />
                      {platform}
                    </label>
                  {/each}
                </div>
                <button class="btn-danger" onclick={() => deleteProject(project.name)}>Delete</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Formatter -->
    <section class="config-section">
      <h2>Formatter</h2>
      <div class="form-row">
        <div class="form-group">
          <label for="fmt-discord">Max Discord Message Length</label>
          <input id="fmt-discord" type="number" bind:value={formatterMaxDiscord} min="100" />
        </div>
        <div class="form-group">
          <label for="fmt-lark">Max Lark Message Length</label>
          <input id="fmt-lark" type="number" bind:value={formatterMaxLark} min="100" />
        </div>
        <div class="form-group">
          <label for="fmt-concurrent">Max Concurrent Processes</label>
          <input id="fmt-concurrent" type="number" bind:value={formatterMaxConcurrent} min="1" max="50" />
        </div>
      </div>
    </section>

    <div class="save-footer">
      <button class="btn-primary" onclick={saveConfig} disabled={saving}>
        {saving ? "Saving…" : "Save Config"}
      </button>
    </div>
  {/if}
</div>

<style>
  .config-page {
    padding: 32px;
    max-width: 860px;
    overflow-y: auto;
    height: 100%;
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
  }

  .page-header h1 {
    font-size: 22px;
    font-weight: 600;
    color: var(--accent);
  }

  .loading {
    color: var(--text-secondary);
    padding: 20px 0;
  }

  .config-section {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 20px;
  }

  .config-section h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 16px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .section-header h2 {
    margin-bottom: 0;
  }

  .form-group {
    margin-bottom: 14px;
    flex: 1;
  }

  .form-group label {
    display: block;
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .hint {
    text-transform: none;
    letter-spacing: 0;
    font-style: italic;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .form-group input[type="text"],
  .form-group input[type="password"],
  .form-group input[type="number"] {
    width: 100%;
    background: #0f3460;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 8px 10px;
    color: var(--text-primary);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .form-group input:focus {
    border-color: var(--accent);
  }

  .form-row {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .form-row .form-group {
    min-width: 180px;
  }

  .checkbox-group {
    display: flex;
    gap: 14px;
    margin-top: 6px;
  }

  .checkbox-group.inline {
    margin-top: 0;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-primary);
    cursor: pointer;
  }

  .checkbox-label input[type="checkbox"] {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
  }

  .project-form {
    background: #0d0d1a;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .project-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .project-card {
    background: #0d0d1a;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .project-name {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 2px;
  }

  .project-dir {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: monospace;
    margin-bottom: 6px;
  }

  .project-meta {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .badge {
    font-size: 11px;
    background: var(--bg-user-msg);
    color: var(--accent);
    border-radius: 4px;
    padding: 2px 7px;
  }

  .badge.platform {
    color: #a0e0a0;
  }

  .project-actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }

  .empty-hint {
    color: var(--text-secondary);
    font-style: italic;
    font-size: 13px;
  }

  .save-footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
    padding-bottom: 32px;
  }

  .btn-primary {
    background: var(--accent);
    color: #0d0d1a;
    border: none;
    border-radius: 5px;
    padding: 8px 18px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .btn-secondary {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 5px;
    padding: 6px 14px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-secondary:hover {
    background: rgba(76, 201, 240, 0.1);
  }

  .btn-danger {
    background: transparent;
    color: #f87171;
    border: 1px solid #f87171;
    border-radius: 5px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn-danger:hover {
    background: rgba(248, 113, 113, 0.12);
  }

  .toast {
    position: fixed;
    top: 20px;
    right: 24px;
    z-index: 1000;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    animation: fadeIn 0.2s ease;
  }

  .toast.success {
    background: #1a3a2a;
    border: 1px solid #4ade80;
    color: #4ade80;
  }

  .toast.error {
    background: #3a1a1a;
    border: 1px solid #f87171;
    color: #f87171;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
