<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { Badge } from '$lib/components/ui/badge';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import MessageBubble from '$lib/MessageBubble.svelte';
  import ChatInput from '$lib/ChatInput.svelte';
  import { sessions, sendMessage, loadSession } from '$lib/stores/chat';
  import { send } from '$lib/stores/connection';

  let project = $derived($page.params.project ?? '');
  let sessionId = $derived($page.params.session ?? '');

  let session = $derived(sessionId ? $sessions.get(sessionId) : undefined);
  let messages = $derived(session?.messages ?? []);
  let isStreaming = $derived(
    messages.length > 0 && messages[messages.length - 1]?.streaming === true
  );

  const totalInputTokens = $derived(
    messages.reduce((sum, m) => sum + (m.tokens?.input ?? 0), 0)
  );
  const totalOutputTokens = $derived(
    messages.reduce((sum, m) => sum + (m.tokens?.output ?? 0), 0)
  );

  let viewportEl = $state<HTMLElement | null>(null);

  onMount(async () => {
    // Validate project exists (best-effort)
    try {
      const projRes = await fetch('/api/projects');
      if (projRes.ok) {
        const projects = await projRes.json();
        if (!projects.some((p: { name: string }) => p.name === project)) {
          toast.error(`Project "${project}" not found`);
          goto('/chat', { replaceState: true });
          return;
        }
      }
    } catch {
      // Continue — validation is best-effort
    }

    try {
      await loadSession('', sessionId, project);
    } catch {
      toast.error('Failed to load session');
      goto('/chat', { replaceState: true });
    }
  });

  $effect(() => {
    // scroll to bottom when messages change or streaming updates
    void messages.length;
    void isStreaming;
    if (viewportEl) {
      viewportEl.scrollTop = viewportEl.scrollHeight;
    }
  });

  function handleSend(text: string, images: string[]) {
    // images are accepted but currently only text is forwarded (multimodal future work)
    sendMessage(project, text, sessionId);
  }

  function handleAbort() {
    send({ type: 'chat.abort' });
  }
</script>

<div class="flex flex-col h-full overflow-hidden">
  <ScrollArea class="flex-1" bind:viewportRef={viewportEl}>
    <div class="p-5">
      {#if messages.length === 0}
        <div class="flex items-center justify-center h-32 text-sm text-muted-foreground">
          No messages yet. Say hello!
        </div>
      {:else}
        {#each messages as message (message.id)}
          <MessageBubble {message} />
        {/each}
      {/if}
    </div>
  </ScrollArea>

  {#if messages.length > 0}
    <div class="flex justify-end gap-1.5 px-4 py-1 border-t border-border bg-muted/20">
      <span class="text-xs text-muted-foreground">Session tokens</span>
      <Badge variant="outline" class="text-[10px] px-1.5 py-0 h-4">
        in: {totalInputTokens.toLocaleString()}
      </Badge>
      <Badge variant="outline" class="text-[10px] px-1.5 py-0 h-4">
        out: {totalOutputTokens.toLocaleString()}
      </Badge>
    </div>
  {/if}

  <ChatInput
    {project}
    {sessionId}
    streaming={isStreaming}
    onSend={handleSend}
    onAbort={handleAbort}
  />
</div>
