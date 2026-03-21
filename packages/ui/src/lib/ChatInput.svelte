<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import Send from 'lucide-svelte/icons/send';
  import Square from 'lucide-svelte/icons/square';
  import X from 'lucide-svelte/icons/x';

  let {
    project = null,
    sessionId = null,
    streaming = false,
    onSend,
    onAbort,
  }: {
    project?: string | null;
    sessionId?: string | null;
    streaming?: boolean;
    onSend: (text: string, images: string[]) => void;
    onAbort: () => void;
  } = $props();

  let text = $state('');
  let images = $state<string[]>([]);
  let dragOver = $state(false);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  const disabled = $derived(!project);

  function autoResize() {
    if (!textareaEl) return;
    textareaEl.style.height = 'auto';
    textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled || streaming) return;
    onSend(trimmed, images);
    text = '';
    images = [];
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  async function processFile(file: File): Promise<string | undefined> {
    if (!file.type.startsWith('image/')) return undefined;
    return new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const files = Array.from(e.dataTransfer?.files ?? []);
    for (const file of files) {
      const dataUrl = await processFile(file);
      if (dataUrl) images = [...images, dataUrl];
    }
  }

  async function handlePaste(e: ClipboardEvent) {
    const items = Array.from(e.clipboardData?.items ?? []);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const dataUrl = await processFile(file);
          if (dataUrl) images = [...images, dataUrl];
        }
      }
    }
  }

  function removeImage(idx: number) {
    images = images.filter((_, i) => i !== idx);
  }
</script>

<div class="bg-background px-4 py-3 flex-shrink-0">
  {#if images.length > 0}
    <div class="flex gap-2 flex-wrap mb-2">
      {#each images as img, i (i)}
        <div class="relative w-16 h-16">
          <img
            src={img}
            alt="attachment {i + 1}"
            class="w-full h-full object-cover rounded-md border border-border"
          />
          <Button
            variant="destructive"
            size="icon"
            class="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full p-0"
            onclick={() => removeImage(i)}
          >
            <X class="h-3 w-3" />
          </Button>
        </div>
      {/each}
    </div>
  {/if}

  <div
    class={[
      'flex gap-2 items-end rounded-lg border p-2 transition-colors',
      dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30',
    ].join(' ')}
    role="region"
    aria-label="Message input area — drag and drop images here"
    ondragover={(e) => { e.preventDefault(); dragOver = true; }}
    ondragleave={() => { dragOver = false; }}
    ondrop={handleDrop}
  >
    <Textarea
      bind:ref={textareaEl}
      bind:value={text}
      class="flex-1 min-h-0 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-0 p-0 py-1.5 text-sm leading-relaxed"
      placeholder={disabled ? 'Select a project to start chatting' : 'Message\u2026 (Enter to send, Shift+Enter for newline)'}
      {disabled}
      rows={1}
      oninput={autoResize}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
    />

    <div class="flex items-end flex-shrink-0">
      {#if streaming}
        <Button
          variant="destructive"
          size="sm"
          onclick={onAbort}
          title="Stop generation"
          class="gap-1.5"
        >
          <Square class="h-3.5 w-3.5 fill-current" />
          Stop
        </Button>
      {:else}
        <Button
          size="icon-sm"
          onclick={handleSend}
          disabled={disabled || !text.trim()}
          title="Send message"
        >
          <Send class="h-4 w-4" />
        </Button>
      {/if}
    </div>
  </div>

</div>
