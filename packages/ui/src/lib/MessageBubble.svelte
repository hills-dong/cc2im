<script lang="ts">
  import { marked } from 'marked';
  import hljs from 'highlight.js';
  import { Badge } from '$lib/components/ui/badge';
  import type { ChatMessage } from './stores/chat.js';

  let { message }: { message: ChatMessage } = $props();

  function renderMarkdown(content: string): string {
    if (!content) return '';
    const html = marked.parse(content, { async: false }) as string;
    return html;
  }

  function highlightCode(node: HTMLElement) {
    node.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block as HTMLElement);
    });
  }

  let renderedHtml = $derived(renderMarkdown(message.content));
</script>

<div
  class={[
    'flex flex-col mb-4',
    message.role === 'user' ? 'items-end' : 'items-start',
  ].join(' ')}
>
  <div
    class={[
      'max-w-[80%] rounded-xl px-3.5 py-2.5 leading-relaxed break-words',
      message.role === 'user'
        ? 'bg-primary/10 rounded-br-sm'
        : 'bg-card border border-border rounded-bl-sm',
    ].join(' ')}
    use:highlightCode
  >
    {#if message.role === 'user'}
      <div class="text-sm whitespace-pre-wrap">{message.content}</div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="prose prose-sm dark:prose-invert max-w-none text-sm">{@html renderedHtml}</div>
      {#if message.streaming}
        <span class="inline-block animate-pulse text-primary ml-0.5">▋</span>
      {/if}
    {/if}
  </div>

  {#if message.tokens}
    <div class="flex gap-1 mt-1 px-1">
      <Badge variant="secondary" class="text-[10px] px-1.5 py-0 h-4">
        in: {message.tokens.input}
      </Badge>
      <Badge variant="secondary" class="text-[10px] px-1.5 py-0 h-4">
        out: {message.tokens.output}
      </Badge>
    </div>
  {/if}
</div>
