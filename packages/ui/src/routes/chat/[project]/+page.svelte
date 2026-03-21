<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import MessageBubble from '$lib/MessageBubble.svelte';
  import ChatInput from '$lib/ChatInput.svelte';
  import { sessions, sendMessage } from '$lib/stores/chat';
  import { send } from '$lib/stores/connection';
  import MessageSquare from 'lucide-svelte/icons/message-square';

  let project = $derived($page.params.project ?? '');
  const sessKey = $derived(`new-${project}`);
  let session = $derived($sessions.get(sessKey));
  let messages = $derived(session?.messages ?? []);
  let isStreaming = $derived(
    messages.length > 0 && messages[messages.length - 1]?.streaming === true
  );

  let viewportEl = $state<HTMLElement | null>(null);
  let isNearBottom = $state(true);
  let navigated = $state(false);

  function checkNearBottom() {
    if (!viewportEl) return;
    const threshold = 80;
    isNearBottom = viewportEl.scrollHeight - viewportEl.scrollTop - viewportEl.clientHeight < threshold;
  }

  // Navigate to the session URL using threadKey (matches sidebar links)
  $effect(() => {
    if (session?.threadKey && !isStreaming && !navigated && messages.length > 0) {
      navigated = true;
      goto(`/chat/${encodeURIComponent(project)}/${encodeURIComponent(session.threadKey)}`, { replaceState: true });
    }
  });

  $effect(() => {
    void messages.length;
    void isStreaming;
    if (viewportEl && (isNearBottom || isStreaming)) {
      viewportEl.scrollTop = viewportEl.scrollHeight;
    }
  });

  function handleSend(text: string, images: string[]) {
    sendMessage(project, text);
  }

  function handleAbort() {
    send({ type: 'chat.abort' });
  }
</script>

<div class="flex flex-col h-full overflow-hidden">
  <ScrollArea class="flex-1 min-h-0" bind:viewportRef={viewportEl} onscroll={checkNearBottom}>
    <div class="p-5">
      {#if messages.length === 0}
        <div class="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
          <MessageSquare class="h-8 w-8" />
          <span class="text-sm">New conversation in {project}</span>
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
    streaming={isStreaming}
    onSend={handleSend}
    onAbort={handleAbort}
  />
</div>
