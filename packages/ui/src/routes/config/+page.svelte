<script lang="ts">
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";

  interface Project {
    name: string;
    directory: string;
    model?: string;
    platforms: Record<string, boolean>;
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
      maxMessageLength?: Record<string, number>;
      maxConcurrentProcesses?: number;
    };
  }

  let config = $state<Config>({});
  let loading = $state(true);
  let saving = $state(false);

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
  let newProject = $state<Project>({ name: "", directory: "", model: "", platforms: {} });

  function populateFields(cfg: Config) {
    claudeCommand = cfg.claude?.command ?? "";
    claudeDefaultArgs = (cfg.claude?.defaultArgs ?? []).join(", ");
    claudeTimeout = cfg.claude?.timeout ?? 30000;
    claudeBufferInterval = cfg.claude?.bufferInterval ?? 100;
    discordToken = cfg.discord?.token ?? "";
    larkAppId = cfg.lark?.appId ?? "";
    larkAppSecret = cfg.lark?.appSecret ?? "";
    formatterMaxDiscord = cfg.formatter?.maxMessageLength?.discord ?? 2000;
    formatterMaxLark = cfg.formatter?.maxMessageLength?.lark ?? 4096;
    formatterMaxConcurrent = cfg.formatter?.maxConcurrentProcesses ?? 5;
    projects = (cfg.projects ?? []).map((p) => ({
      ...p,
      platforms: p.platforms ?? {},
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
      toast.error("Failed to load config: " + String(e));
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
          maxMessageLength: {
            discord: formatterMaxDiscord,
            lark: formatterMaxLark,
            web: 100000,
          },
          maxConcurrentProcesses: formatterMaxConcurrent,
        },
      };
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Saved");
    } catch (e) {
      toast.error("Failed to save: " + String(e));
    } finally {
      saving = false;
    }
  }

  async function addProject() {
    if (!newProject.name || !newProject.directory) {
      toast.error("Project name and directory are required");
      return;
    }
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProject),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      projects = [...projects, { ...newProject, platforms: { ...newProject.platforms } }];
      newProject = { name: "", directory: "", model: "", platforms: {} };
      showAddProject = false;
      toast.success("Project added");
    } catch (e) {
      toast.error("Failed to add project: " + String(e));
    }
  }

  async function deleteProject(name: string) {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      projects = projects.filter((p) => p.name !== name);
      toast.success("Project deleted");
    } catch (e) {
      toast.error("Failed to delete project: " + String(e));
    }
  }

  function togglePlatform(project: Project, platform: string) {
    const idx = projects.findIndex((p) => p.name === project.name);
    if (idx === -1) return;
    const platforms = { ...projects[idx].platforms };
    platforms[platform] = !platforms[platform];
    if (!platforms[platform]) delete platforms[platform];
    projects[idx] = { ...projects[idx], platforms };
    projects = [...projects];
  }

  function toggleNewPlatform(platform: string) {
    const platforms = { ...newProject.platforms };
    platforms[platform] = !platforms[platform];
    if (!platforms[platform]) delete platforms[platform];
    newProject = { ...newProject, platforms };
  }

  onMount(loadConfig);
</script>

<div class="flex-1 overflow-auto p-6">
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Page header -->
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">Configuration</h1>
      <Button onclick={saveConfig} disabled={saving || loading}>
        {saving ? "Saving…" : "Save Config"}
      </Button>
    </div>

    {#if loading}
      <p class="text-muted-foreground text-sm">Loading configuration…</p>
    {:else}

      <!-- Formatter Settings Card -->
      <Card.Root class="animate-fade-up">
        <Card.Header>
          <Card.Title>Formatter</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div class="space-y-2">
              <Label for="fmt-discord">Max Discord Message Length</Label>
              <Input
                id="fmt-discord"
                type="number"
                bind:value={formatterMaxDiscord}
                min={100}
              />
            </div>
            <div class="space-y-2">
              <Label for="fmt-lark">Max Lark Message Length</Label>
              <Input
                id="fmt-lark"
                type="number"
                bind:value={formatterMaxLark}
                min={100}
              />
            </div>
            <div class="space-y-2">
              <Label for="fmt-concurrent">Max Concurrent Processes</Label>
              <Input
                id="fmt-concurrent"
                type="number"
                bind:value={formatterMaxConcurrent}
                min={1}
                max={50}
              />
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Claude Settings Card -->
      <Card.Root class="animate-fade-up" style="animation-delay: 80ms">
        <Card.Header>
          <Card.Title>Claude Settings</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <Label for="claude-command">Command Path</Label>
            <Input
              id="claude-command"
              type="text"
              bind:value={claudeCommand}
              placeholder="claude"
            />
          </div>
          <div class="space-y-2">
            <Label for="claude-args">
              Default Args
              <span class="text-muted-foreground font-normal italic text-xs ml-1">(comma-separated)</span>
            </Label>
            <Input
              id="claude-args"
              type="text"
              bind:value={claudeDefaultArgs}
              placeholder="--dangerously-skip-permissions"
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="claude-timeout">Timeout (ms)</Label>
              <Input
                id="claude-timeout"
                type="number"
                bind:value={claudeTimeout}
                min={1000}
              />
            </div>
            <div class="space-y-2">
              <Label for="claude-buffer">Buffer Interval (ms)</Label>
              <Input
                id="claude-buffer"
                type="number"
                bind:value={claudeBufferInterval}
                min={10}
              />
            </div>
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Discord Settings Card -->
      <Card.Root class="animate-fade-up" style="animation-delay: 160ms">
        <Card.Header>
          <Card.Title>Discord</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <Label for="discord-token">Bot Token</Label>
            <Input
              id="discord-token"
              type="password"
              bind:value={discordToken}
              placeholder="••••••••"
              autocomplete="off"
            />
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Lark Settings Card -->
      <Card.Root class="animate-fade-up" style="animation-delay: 240ms">
        <Card.Header>
          <Card.Title>Lark / Feishu</Card.Title>
        </Card.Header>
        <Card.Content class="space-y-4">
          <div class="space-y-2">
            <Label for="lark-appid">App ID</Label>
            <Input
              id="lark-appid"
              type="text"
              bind:value={larkAppId}
              placeholder="cli_xxx"
            />
          </div>
          <div class="space-y-2">
            <Label for="lark-secret">App Secret</Label>
            <Input
              id="lark-secret"
              type="password"
              bind:value={larkAppSecret}
              placeholder="••••••••"
              autocomplete="off"
            />
          </div>
        </Card.Content>
      </Card.Root>

      <!-- Projects Card -->
      <Card.Root class="animate-fade-up" style="animation-delay: 320ms">
        <Card.Header>
          <div class="flex items-center justify-between">
            <Card.Title>Projects</Card.Title>
            <Button
              variant="outline"
              size="sm"
              onclick={() => (showAddProject = !showAddProject)}
            >
              {showAddProject ? "Cancel" : "+ Add Project"}
            </Button>
          </div>
        </Card.Header>
        <Card.Content class="space-y-4">

          {#if showAddProject}
            <div class="border rounded-md p-4 space-y-4 bg-muted/30">
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="new-proj-name">Name</Label>
                  <Input
                    id="new-proj-name"
                    type="text"
                    bind:value={newProject.name}
                    placeholder="my-project"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="new-proj-dir">Directory</Label>
                  <Input
                    id="new-proj-dir"
                    type="text"
                    bind:value={newProject.directory}
                    placeholder="/home/user/project"
                  />
                </div>
              </div>
              <div class="space-y-2">
                <Label for="new-proj-model">Model</Label>
                <Input
                  id="new-proj-model"
                  type="text"
                  bind:value={newProject.model}
                  placeholder="haiku / sonnet / opus (default)"
                />
              </div>
              <div class="space-y-2">
                <Label>Platforms</Label>
                <div class="flex gap-6">
                  {#each ["discord", "lark"] as platform}
                    <div class="flex items-center gap-2">
                      <Switch
                        id="new-platform-{platform}"
                        checked={newProject.platforms[platform] ?? false}
                        onCheckedChange={() => toggleNewPlatform(platform)}
                      />
                      <Label for="new-platform-{platform}" class="cursor-pointer capitalize">
                        {platform}
                      </Label>
                    </div>
                  {/each}
                </div>
              </div>
              <Button onclick={addProject}>Add Project</Button>
            </div>
          {/if}

          {#if projects.length === 0 && !showAddProject}
            <p class="text-muted-foreground text-sm italic">No projects configured.</p>
          {:else if projects.length > 0}
            <div class="space-y-3">
              {#each projects as project, i (project.name)}
                {#if i > 0}
                  <Separator />
                {/if}
                <div class="flex items-start justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <div class="font-medium text-sm">{project.name}</div>
                    <div class="text-xs text-muted-foreground font-mono truncate mt-0.5">{project.directory}</div>
                    <div class="flex gap-1.5 mt-1.5 flex-wrap">
                      {#if project.model}
                        <span class="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground text-xs px-1.5 py-0.5">{project.model}</span>
                      {/if}
                      {#each Object.entries(project.platforms).filter(([, v]) => v) as [platform]}
                        <span class="inline-flex items-center rounded-sm bg-secondary text-secondary-foreground text-xs px-1.5 py-0.5">{platform}</span>
                      {/each}
                    </div>
                  </div>
                  <div class="flex items-center gap-4 flex-shrink-0">
                    <div class="flex gap-4">
                      {#each ["discord", "lark"] as platform}
                        <div class="flex items-center gap-1.5">
                          <Switch
                            id="proj-{project.name}-{platform}"
                            checked={project.platforms[platform] ?? false}
                            onCheckedChange={() => togglePlatform(project, platform)}
                          />
                          <Label for="proj-{project.name}-{platform}" class="cursor-pointer text-xs capitalize">
                            {platform}
                          </Label>
                        </div>
                      {/each}
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onclick={() => deleteProject(project.name)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

        </Card.Content>
      </Card.Root>

      <!-- Save Button Footer -->
      <div class="flex justify-end pb-8">
        <Button onclick={saveConfig} disabled={saving}>
          {saving ? "Saving…" : "Save Config"}
        </Button>
      </div>

    {/if}
  </div>
</div>
