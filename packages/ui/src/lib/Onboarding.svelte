<script lang="ts">
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import * as Dialog from '$lib/components/ui/dialog/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { Input } from '$lib/components/ui/input/index.js';
  import { Label } from '$lib/components/ui/label/index.js';

  const TOTAL_STEPS = 5;

  let { open = $bindable(false) } = $props();

  let step = $state(1);
  let testResult = $state<"idle" | "testing" | "ok" | "fail">("idle");
  let testError = $state("");

  // Step 1 & 2
  let claudeCommand = $state("claude");

  // Step 3
  let projectName = $state("");
  let projectDirectory = $state("");

  // Step 4
  let discordToken = $state("");
  let larkAppId = $state("");
  let larkAppSecret = $state("");

  // Step validation
  function canProceed(): boolean {
    if (step === 1) return claudeCommand.trim().length > 0;
    if (step === 2) return testResult === "ok";
    if (step === 3) return projectName.trim().length > 0 && projectDirectory.trim().length > 0;
    return true;
  }

  function next() {
    if (step < TOTAL_STEPS && canProceed()) step++;
  }

  function back() {
    if (step > 1) {
      step--;
      if (step === 2) testResult = "idle";
    }
  }

  async function testClaude() {
    testResult = "testing";
    testError = "";
    try {
      const res = await fetch("/api/claude/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: claudeCommand }),
      });
      if (res.ok) {
        testResult = "ok";
      } else {
        const data = await res.json().catch(() => ({}));
        testError = data.error ?? `HTTP ${res.status}`;
        testResult = "fail";
      }
    } catch (e) {
      testError = String(e);
      testResult = "fail";
    }
  }

  let saving = $state(false);

  async function handleComplete() {
    saving = true;
    try {
      // Save config with claude command and platform tokens
      const config: Record<string, unknown> = {
        claude: { command: claudeCommand },
      };
      if (discordToken) config.discord = { token: discordToken };
      if (larkAppId || larkAppSecret) config.lark = { appId: larkAppId, appSecret: larkAppSecret };

      const configRes = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!configRes.ok) throw new Error(`Config save failed: HTTP ${configRes.status}`);

      // Add the first project
      if (projectName && projectDirectory) {
        const projRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: projectName,
            directory: projectDirectory,
            platforms: {
              ...(discordToken ? { discord: true } : {}),
              ...(larkAppId ? { lark: true } : {}),
            },
          }),
        });
        if (!projRes.ok) throw new Error(`Project add failed: HTTP ${projRes.status}`);
      }

      open = false;
      goto('/chat');
    } catch (e) {
      toast.error("Setup failed: " + String(e));
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open closeOnOutsideClick={false} closeOnEscape={false}>
  <Dialog.Content showCloseButton={false} class="sm:max-w-[520px] flex flex-col gap-0 p-0 overflow-hidden">
    <!-- Step indicator -->
    <div class="flex items-center gap-1.5 px-6 pt-5">
      {#each Array(TOTAL_STEPS) as _, i}
        <div
          class="w-2 h-2 rounded-full transition-colors duration-200 {i + 1 === step
            ? 'bg-primary'
            : i + 1 < step
              ? 'bg-foreground/40'
              : 'bg-border'}"
        ></div>
      {/each}
      <span class="ml-2 text-xs text-muted-foreground">{step} / {TOTAL_STEPS}</span>
    </div>

    <!-- Wizard body -->
    <div class="px-7 py-6 overflow-y-auto flex-1">
      <!-- Step 1: Claude path -->
      {#if step === 1}
        <Dialog.Header class="mb-5">
          <Dialog.Title>Detect Claude Code CLI</Dialog.Title>
          <Dialog.Description>
            Enter the path to the <code class="text-primary text-xs font-mono">claude</code> executable.
            Usually just <code class="text-primary text-xs font-mono">claude</code> if it's in your PATH.
          </Dialog.Description>
        </Dialog.Header>
        <div class="space-y-2 mb-4">
          <Label for="claude-cmd">Claude Command</Label>
          <Input
            id="claude-cmd"
            type="text"
            bind:value={claudeCommand}
            placeholder="claude"
          />
        </div>
        <p class="text-xs text-muted-foreground mt-3">
          Don't have Claude Code installed?
          <a href="https://docs.anthropic.com/claude-code" target="_blank" rel="noreferrer" class="text-primary underline underline-offset-2 hover:opacity-80">
            Get it here
          </a>
        </p>

      <!-- Step 2: Verify Claude -->
      {:else if step === 2}
        <Dialog.Header class="mb-5">
          <Dialog.Title>Verify Claude Code</Dialog.Title>
          <Dialog.Description>
            Let's confirm <code class="text-primary text-xs font-mono">{claudeCommand}</code> works correctly.
          </Dialog.Description>
        </Dialog.Header>
        <Button onclick={testClaude} disabled={testResult === "testing"} class="mb-4">
          {testResult === "testing" ? "Testing\u2026" : "Test Command"}
        </Button>
        {#if testResult === "ok"}
          <div class="mt-4 px-3.5 py-2.5 rounded-md border border-border bg-muted/30 text-foreground text-sm leading-relaxed">
            Claude Code detected successfully.
          </div>
        {:else if testResult === "fail"}
          <div class="mt-4 px-3.5 py-2.5 rounded-md border border-destructive bg-destructive/10 text-destructive text-sm leading-relaxed">
            Test failed: {testError || "Unknown error"}.<br />
            Go back and check the command path.
          </div>
        {/if}

      <!-- Step 3: Add first project -->
      {:else if step === 3}
        <Dialog.Header class="mb-5">
          <Dialog.Title>Add Your First Project</Dialog.Title>
          <Dialog.Description>Set up a project directory that Claude will work with.</Dialog.Description>
        </Dialog.Header>
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="proj-name">Project Name</Label>
            <Input
              id="proj-name"
              type="text"
              bind:value={projectName}
              placeholder="my-project"
            />
          </div>
          <div class="space-y-2">
            <Label for="proj-dir">Directory Path</Label>
            <Input
              id="proj-dir"
              type="text"
              bind:value={projectDirectory}
              placeholder="/home/user/my-project"
            />
            <p class="text-xs text-muted-foreground">Enter the absolute path to your project directory.</p>
          </div>
        </div>

      <!-- Step 4: Platforms -->
      {:else if step === 4}
        <Dialog.Header class="mb-5">
          <Dialog.Title>
            Connect Platforms <span class="text-sm font-normal text-muted-foreground">(Optional)</span>
          </Dialog.Title>
          <Dialog.Description>
            Connect Discord and/or Lark to receive Claude responses there. You can skip this step.
          </Dialog.Description>
        </Dialog.Header>
        <div class="space-y-6">
          <div>
            <h3 class="text-sm font-semibold mb-3">Discord</h3>
            <div class="space-y-2">
              <Label for="discord-tok">Bot Token</Label>
              <Input
                id="discord-tok"
                type="password"
                bind:value={discordToken}
                placeholder="••••••••"
                autocomplete="off"
              />
            </div>
          </div>
          <div>
            <h3 class="text-sm font-semibold mb-3">Lark / Feishu</h3>
            <div class="space-y-3">
              <div class="space-y-2">
                <Label for="lark-id">App ID</Label>
                <Input
                  id="lark-id"
                  type="text"
                  bind:value={larkAppId}
                  placeholder="cli_xxx"
                />
              </div>
              <div class="space-y-2">
                <Label for="lark-sec">App Secret</Label>
                <Input
                  id="lark-sec"
                  type="password"
                  bind:value={larkAppSecret}
                  placeholder="••••••••"
                  autocomplete="off"
                />
              </div>
            </div>
          </div>
        </div>

      <!-- Step 5: Complete -->
      {:else if step === 5}
        <Dialog.Header class="mb-5">
          <Dialog.Title>All Set!</Dialog.Title>
          <Dialog.Description>Here's a summary of your setup:</Dialog.Description>
        </Dialog.Header>
        <div class="rounded-lg border border-border bg-muted/20 p-4 mb-5 space-y-0">
          <div class="flex items-baseline gap-3 py-1.5 border-b border-border/50">
            <span class="text-xs text-muted-foreground min-w-[130px]">Claude Command</span>
            <code class="text-xs font-mono text-primary">{claudeCommand}</code>
          </div>
          <div class="flex items-baseline gap-3 py-1.5 border-b border-border/50">
            <span class="text-xs text-muted-foreground min-w-[130px]">Project</span>
            <span class="text-sm text-foreground">{projectName}</span>
          </div>
          <div class="flex items-baseline gap-3 py-1.5 {discordToken || larkAppId ? 'border-b border-border/50' : ''}">
            <span class="text-xs text-muted-foreground min-w-[130px]">Directory</span>
            <code class="text-xs font-mono text-primary">{projectDirectory}</code>
          </div>
          {#if discordToken}
            <div class="flex items-baseline gap-3 py-1.5 {larkAppId ? 'border-b border-border/50' : ''}">
              <span class="text-xs text-muted-foreground min-w-[130px]">Discord</span>
              <span class="text-sm text-foreground">Configured</span>
            </div>
          {/if}
          {#if larkAppId}
            <div class="flex items-baseline gap-3 py-1.5">
              <span class="text-xs text-muted-foreground min-w-[130px]">Lark</span>
              <span class="text-sm text-foreground">Configured</span>
            </div>
          {/if}
        </div>
        <p class="text-sm text-muted-foreground">You're ready to start chatting with Claude!</p>
      {/if}
    </div>

    <!-- Navigation footer -->
    <Dialog.Footer class="flex items-center justify-between px-7 py-4 border-t border-border mt-0">
      <div>
        {#if step > 1}
          <Button variant="outline" onclick={back}>Back</Button>
        {/if}
      </div>
      <div class="flex items-center gap-2.5">
        {#if step === 4}
          <Button variant="ghost" onclick={next}>Skip</Button>
        {/if}
        {#if step < TOTAL_STEPS}
          <Button onclick={next} disabled={!canProceed()}>Next</Button>
        {:else}
          <Button onclick={handleComplete} disabled={saving}>
            {saving ? "Saving\u2026" : "Start Chatting"}
          </Button>
        {/if}
      </div>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
