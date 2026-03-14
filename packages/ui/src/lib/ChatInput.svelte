<script lang="ts">
  import { send } from "./stores/connection.js";

  let {
    project,
    sessionId,
    streaming = false,
    onSend,
    onAbort,
  }: {
    project: string | null;
    sessionId: string | null;
    streaming?: boolean;
    onSend: (text: string, images: string[]) => void;
    onAbort: () => void;
  } = $props();

  let text = $state("");
  let images = $state<string[]>([]);
  let dragOver = $state(false);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  const disabled = $derived(!project);

  function autoResize() {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
    textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + "px";
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled || streaming) return;
    onSend(trimmed, images);
    text = "";
    images = [];
    if (textareaEl) {
      textareaEl.style.height = "auto";
    }
  }

  async function processFile(file: File) {
    if (!file.type.startsWith("image/")) return;
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
      if (item.type.startsWith("image/")) {
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

<div class="chat-input-area">
  {#if images.length > 0}
    <div class="image-previews">
      {#each images as img, i (i)}
        <div class="image-preview">
          <img src={img} alt="attachment {i + 1}" />
          <button class="remove-img" onclick={() => removeImage(i)}>×</button>
        </div>
      {/each}
    </div>
  {/if}

  <div
    class="input-row"
    class:drag-over={dragOver}
    ondragover={(e) => { e.preventDefault(); dragOver = true; }}
    ondragleave={() => { dragOver = false; }}
    ondrop={handleDrop}
  >
    <textarea
      bind:this={textareaEl}
      bind:value={text}
      class="message-input"
      placeholder={disabled ? "Select a project to start chatting" : "Message… (Enter to send, Shift+Enter for newline)"}
      {disabled}
      rows={1}
      oninput={autoResize}
      onkeydown={handleKeydown}
      onpaste={handlePaste}
    ></textarea>

    <div class="input-actions">
      {#if streaming}
        <button class="abort-btn" onclick={onAbort} title="Stop generation">
          ■ Stop
        </button>
      {:else}
        <button
          class="send-btn"
          onclick={handleSend}
          disabled={disabled || !text.trim()}
          title="Send message"
        >
          ➤
        </button>
      {/if}
    </div>
  </div>

  <div class="input-hint">
    Drag & drop or paste images to attach
  </div>
</div>

<style>
  .chat-input-area {
    border-top: 1px solid var(--border);
    background: #16213e;
    padding: 12px 16px;
    flex-shrink: 0;
  }

  .image-previews {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .image-preview {
    position: relative;
    width: 64px;
    height: 64px;
  }

  .image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .remove-img {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #e06c75;
    border: none;
    color: white;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    line-height: 1;
  }

  .input-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    background: #0d0d1a;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 8px;
    transition: border-color 0.2s;
  }

  .input-row.drag-over {
    border-color: var(--accent);
    background: rgba(76, 201, 240, 0.05);
  }

  .message-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 14px;
    font-family: inherit;
    resize: none;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.5;
  }

  .message-input::placeholder {
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .message-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-actions {
    display: flex;
    align-items: flex-end;
    flex-shrink: 0;
  }

  .send-btn {
    background: var(--accent);
    border: none;
    color: #0d0d1a;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.2s;
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn:not(:disabled):hover {
    opacity: 0.85;
  }

  .abort-btn {
    background: #e06c75;
    border: none;
    color: white;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .abort-btn:hover {
    opacity: 0.85;
  }

  .input-hint {
    font-size: 11px;
    color: var(--text-secondary);
    opacity: 0.5;
    margin-top: 6px;
    text-align: center;
  }
</style>
