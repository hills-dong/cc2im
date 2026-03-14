<script lang="ts">
  const TOTAL_STEPS = 5;

  interface OnboardingResult {
    claudeCommand: string;
    projectName: string;
    projectDirectory: string;
    discordToken: string;
    larkAppId: string;
    larkAppSecret: string;
  }

  let { onComplete }: { onComplete: (result: OnboardingResult) => void } = $props();

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

  function finish() {
    onComplete({
      claudeCommand,
      projectName,
      projectDirectory,
      discordToken,
      larkAppId,
      larkAppSecret,
    });
  }
</script>

<div class="overlay">
  <div class="wizard-card">
    <!-- Step indicator -->
    <div class="step-indicator">
      {#each Array(TOTAL_STEPS) as _, i}
        <div
          class="step-dot"
          class:active={i + 1 === step}
          class:done={i + 1 < step}
        ></div>
      {/each}
      <span class="step-label">{step} / {TOTAL_STEPS}</span>
    </div>

    <div class="wizard-body">
      <!-- Step 1: Claude path -->
      {#if step === 1}
        <h2>Detect Claude Code CLI</h2>
        <p class="desc">
          Enter the path to the <code>claude</code> executable. Usually just <code>claude</code>
          if it's in your PATH.
        </p>
        <div class="form-group">
          <label for="claude-cmd">Claude Command</label>
          <input
            id="claude-cmd"
            type="text"
            bind:value={claudeCommand}
            placeholder="claude"
          />
        </div>
        <p class="hint-link">
          Don't have Claude Code installed?
          <a href="https://docs.anthropic.com/claude-code" target="_blank" rel="noreferrer">
            Get it here
          </a>
        </p>

      <!-- Step 2: Verify Claude -->
      {:else if step === 2}
        <h2>Verify Claude Code</h2>
        <p class="desc">
          Let's confirm <code>{claudeCommand}</code> works correctly.
        </p>
        <button class="btn-primary" onclick={testClaude} disabled={testResult === "testing"}>
          {testResult === "testing" ? "Testing…" : "Test Command"}
        </button>
        {#if testResult === "ok"}
          <div class="status-msg success">Claude Code detected successfully.</div>
        {:else if testResult === "fail"}
          <div class="status-msg error">
            Test failed: {testError || "Unknown error"}.<br />
            Go back and check the command path.
          </div>
        {/if}

      <!-- Step 3: Add first project -->
      {:else if step === 3}
        <h2>Add Your First Project</h2>
        <p class="desc">Set up a project directory that Claude will work with.</p>
        <div class="form-group">
          <label for="proj-name">Project Name</label>
          <input id="proj-name" type="text" bind:value={projectName} placeholder="my-project" />
        </div>
        <div class="form-group">
          <label for="proj-dir">Directory Path</label>
          <input
            id="proj-dir"
            type="text"
            bind:value={projectDirectory}
            placeholder="/home/user/my-project"
          />
          <span class="field-hint">Enter the absolute path to your project directory.</span>
        </div>

      <!-- Step 4: Platforms -->
      {:else if step === 4}
        <h2>Connect Platforms <span class="optional">(Optional)</span></h2>
        <p class="desc">Connect Discord and/or Lark to receive Claude responses there. You can skip this step.</p>

        <div class="platform-section">
          <h3>Discord</h3>
          <div class="form-group">
            <label for="discord-tok">Bot Token</label>
            <input
              id="discord-tok"
              type="password"
              bind:value={discordToken}
              placeholder="••••••••"
              autocomplete="off"
            />
          </div>
        </div>

        <div class="platform-section">
          <h3>Lark / Feishu</h3>
          <div class="form-group">
            <label for="lark-id">App ID</label>
            <input id="lark-id" type="text" bind:value={larkAppId} placeholder="cli_xxx" />
          </div>
          <div class="form-group">
            <label for="lark-sec">App Secret</label>
            <input
              id="lark-sec"
              type="password"
              bind:value={larkAppSecret}
              placeholder="••••••••"
              autocomplete="off"
            />
          </div>
        </div>

      <!-- Step 5: Complete -->
      {:else if step === 5}
        <h2>All Set!</h2>
        <p class="desc">Here's a summary of your setup:</p>
        <div class="summary">
          <div class="summary-row">
            <span class="summary-key">Claude Command</span>
            <code>{claudeCommand}</code>
          </div>
          <div class="summary-row">
            <span class="summary-key">Project</span>
            <span>{projectName}</span>
          </div>
          <div class="summary-row">
            <span class="summary-key">Directory</span>
            <code>{projectDirectory}</code>
          </div>
          {#if discordToken}
            <div class="summary-row">
              <span class="summary-key">Discord</span>
              <span class="configured">Configured</span>
            </div>
          {/if}
          {#if larkAppId}
            <div class="summary-row">
              <span class="summary-key">Lark</span>
              <span class="configured">Configured</span>
            </div>
          {/if}
        </div>
        <p class="ready-msg">You're ready to start chatting with Claude!</p>
      {/if}
    </div>

    <!-- Navigation -->
    <div class="wizard-footer">
      <div class="footer-left">
        {#if step > 1}
          <button class="btn-secondary" onclick={back}>Back</button>
        {:else}
          <span></span>
        {/if}
      </div>
      <div class="footer-right">
        {#if step === 4}
          <button class="btn-ghost" onclick={next}>Skip</button>
        {/if}
        {#if step < TOTAL_STEPS}
          <button class="btn-primary" onclick={next} disabled={!canProceed()}>Next</button>
        {:else}
          <button class="btn-primary" onclick={finish}>Start Chatting</button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(13, 13, 26, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 500;
    backdrop-filter: blur(2px);
  }

  .wizard-card {
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 520px;
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
  }

  .step-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 20px 24px 0;
  }

  .step-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border);
    transition: background 0.2s;
  }

  .step-dot.active {
    background: var(--accent);
  }

  .step-dot.done {
    background: #4ade80;
  }

  .step-label {
    margin-left: 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .wizard-body {
    padding: 24px 28px;
    overflow-y: auto;
    flex: 1;
  }

  .wizard-body h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 10px;
  }

  .desc {
    color: var(--text-secondary);
    font-size: 13px;
    margin-bottom: 22px;
    line-height: 1.6;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 5px;
  }

  .form-group input {
    width: 100%;
    background: #0f3460;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 9px 12px;
    color: var(--text-primary);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .form-group input:focus {
    border-color: var(--accent);
  }

  .field-hint {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 4px;
    display: block;
  }

  .hint-link {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 12px;
  }

  .status-msg {
    margin-top: 16px;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.5;
  }

  .status-msg.success {
    background: #1a3a2a;
    border: 1px solid #4ade80;
    color: #4ade80;
  }

  .status-msg.error {
    background: #3a1a1a;
    border: 1px solid #f87171;
    color: #f87171;
  }

  .platform-section {
    margin-bottom: 22px;
  }

  .platform-section h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    margin-bottom: 10px;
  }

  .optional {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary);
  }

  .summary {
    background: #0d0d1a;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 20px;
  }

  .summary-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(42, 42, 78, 0.5);
  }

  .summary-row:last-child {
    border-bottom: none;
  }

  .summary-key {
    font-size: 11px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    min-width: 130px;
  }

  .summary-row code {
    font-size: 12px;
    color: var(--accent);
  }

  .configured {
    color: #4ade80;
    font-size: 13px;
  }

  .ready-msg {
    color: var(--text-secondary);
    font-size: 13px;
    font-style: italic;
  }

  .wizard-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 28px 20px;
    border-top: 1px solid var(--border);
  }

  .footer-right {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .btn-primary {
    background: var(--accent);
    color: #0d0d1a;
    border: none;
    border-radius: 5px;
    padding: 9px 22px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.85;
  }

  .btn-primary:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .btn-secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 8px 18px;
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }

  .btn-secondary:hover {
    border-color: var(--text-secondary);
    color: var(--text-primary);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    border: none;
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .btn-ghost:hover {
    color: var(--text-primary);
  }
</style>
