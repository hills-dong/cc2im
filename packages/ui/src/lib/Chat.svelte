<script lang="ts">
  import { onMount } from "svelte";
  import { sessions, sendMessage, loadSession, currentSessionId } from "./stores/chat.js";
  import { send } from "./stores/connection.js";
  import MessageBubble from "./MessageBubble.svelte";
  import ChatInput from "./ChatInput.svelte";

  let {
    project,
    sessionId,
  }: {
    project: string | null;
    sessionId: string | null;
  } = $props();

  let messagesEl = $state<HTMLElement | null>(null);

  const sessKey = $derived(sessionId ?? (project ? `new-${project}` : null));

  const session = $derived(sessKey ? $sessions.get(sessKey) : null);
  const messages = $derived(session?.messages ?? []);

  const isStreaming = $derived(
    messages.length > 0 && messages[messages.length - 1]?.streaming === true
  );

  const totalInputTokens = $derived(
    messages.reduce((sum, m) => sum + (m.tokens?.input ?? 0), 0)
  );
  const totalOutputTokens = $derived(
    messages.reduce((sum, m) => sum + (m.tokens?.output ?? 0), 0)
  );

  $effect(() => {
    // scroll to bottom when messages change
    void messages.length;
    void isStreaming;
    scrollToBottom();
  });

  $effect(() => {
    if (sessKey && !sessKey.startsWith("new-")) {
      loadSession("", sessKey, project ?? "");
    }
  });

  function scrollToBottom() {
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  function handleSend(text: string, images: string[]) {
    if (!project) return;

    // Build message with optional images
    let content = text;
    if (images.length > 0) {
      // For now, append image data URIs as reference; actual multimodal support can be added later
      content = text;
    }

    sendMessage(project, content, sessionId ?? undefined);
  }

  function handleAbort() {
    send({ type: "chat.abort" });
  }
</script>

<div class="chat-page">
  {#if !project}
    <div class="empty-state">
      <div class="empty-icon">💬</div>
      <h2>Select a project</h2>
      <p>Choose a project from the sidebar to start chatting.</p>
    </div>
  {:else}
    <div class="messages-container" bind:this={messagesEl}>
      {#if messages.length === 0}
        <div class="no-messages">
          <p>No messages yet. Say hello!</p>
        </div>
      {:else}
        {#each messages as message (message.id)}
          <MessageBubble {message} />
        {/each}
      {/if}
    </div>

    <div class="token-bar token-stats">
      <span>Session tokens — in: {totalInputTokens.toLocaleString()} / out: {totalOutputTokens.toLocaleString()}</span>
    </div>

    <ChatInput
      {project}
      {sessionId}
      streaming={isStreaming}
      onSend={handleSend}
      onAbort={handleAbort}
    />
  {/if}
</div>

<style>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-secondary);
  }

  .empty-icon {
    font-size: 48px;
    opacity: 0.5;
  }

  .empty-state h2 {
    font-size: 18px;
    color: var(--text-primary);
  }

  .empty-state p {
    font-size: 14px;
  }

  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
  }

  .no-messages {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .token-bar {
    padding: 4px 24px;
    font-size: 11px;
    color: var(--text-secondary);
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid var(--border);
    text-align: right;
  }
</style>
