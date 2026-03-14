<script lang="ts">
  import { marked } from "marked";
  import hljs from "highlight.js";
  import type { ChatMessage } from "./stores/chat.js";

  let { message }: { message: ChatMessage } = $props();

  function renderMarkdown(content: string): string {
    if (!content) return "";
    // Use marked for markdown parsing
    const html = marked.parse(content, { async: false }) as string;
    return html;
  }

  // After rendering, highlight code blocks
  function highlightCode(node: HTMLElement) {
    node.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
  }

  let renderedHtml = $derived(renderMarkdown(message.content));
</script>

<div class="message-wrap" class:user={message.role === "user"} class:assistant={message.role === "assistant"}>
  <div class="bubble" use:highlightCode>
    {#if message.role === "user"}
      <div class="content">{message.content}</div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="content markdown">{@html renderedHtml}</div>
      {#if message.streaming}
        <span class="cursor">▋</span>
      {/if}
    {/if}
  </div>
  {#if message.tokens}
    <div class="token-info">
      in: {message.tokens.input} / out: {message.tokens.output}
    </div>
  {/if}
</div>

<style>
  .message-wrap {
    display: flex;
    flex-direction: column;
    margin-bottom: 16px;
  }

  .message-wrap.user {
    align-items: flex-end;
  }

  .message-wrap.assistant {
    align-items: flex-start;
  }

  .bubble {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 12px;
    word-break: break-word;
    line-height: 1.6;
  }

  .user .bubble {
    background: var(--bg-user-msg);
    color: var(--text-primary);
    border-radius: 12px 12px 2px 12px;
  }

  .assistant .bubble {
    background: #222240;
    border: 1px solid var(--border);
    color: var(--text-primary);
    border-radius: 12px 12px 12px 2px;
  }

  .content {
    white-space: pre-wrap;
  }

  .content.markdown {
    white-space: normal;
  }

  .cursor {
    display: inline-block;
    animation: blink 1s step-end infinite;
    color: var(--accent);
    margin-left: 2px;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  .token-info {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 4px;
    padding: 0 4px;
  }
</style>
