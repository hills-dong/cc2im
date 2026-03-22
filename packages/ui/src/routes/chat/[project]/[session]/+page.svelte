<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import MessageBubble from '$lib/MessageBubble.svelte';
  import ChatInput from '$lib/ChatInput.svelte';
  import { sessions, sendMessage, loadSession, subscribeThread } from '$lib/stores/chat';
  import { send, onReconnect } from '$lib/stores/connection';

  let project = $derived($page.params.project ?? '');
  let sessionId = $derived($page.params.session ?? '');

  let session = $derived(sessionId ? $sessions.get(sessionId) : undefined);
  let messages = $derived(session?.messages ?? []);
  let isStreaming = $derived(
    messages.length > 0 && messages[messages.length - 1]?.streaming === true
  );

  let viewportEl = $state<HTMLElement | null>(null);
  let isNearBottom = $state(true);

  function checkNearBottom() {
    if (!viewportEl) return;
    const threshold = 80;
    isNearBottom = viewportEl.scrollHeight - viewportEl.scrollTop - viewportEl.clientHeight < threshold;
  }

  // Load session whenever sessionId changes (handles both initial mount and sidebar navigation)
  $effect(() => {
    const sid = sessionId;
    const proj = project;
    if (!sid) return;
    // Subscribe to stream events (triggers recovery if stream is in-flight)
    subscribeThread(sid);
    loadSession('', sid, proj).catch(() => {
      toast.error('Failed to load session');
      goto('/chat', { replaceState: true });
    });
    // Re-subscribe on WebSocket reconnect so in-flight streams resume
    return onReconnect(() => subscribeThread(sid));
  });

  $effect(() => {
    // scroll to bottom only when user is near the bottom (or streaming)
    void messages.length;
    void isStreaming;
    if (viewportEl && (isNearBottom || isStreaming)) {
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
  <ScrollArea class="flex-1 min-h-0" bind:viewportRef={viewportEl} onscroll={checkNearBottom}>
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

  <ChatInput
    {project}
    {sessionId}
    streaming={isStreaming}
    onSend={handleSend}
    onAbort={handleAbort}
  />
</div>
