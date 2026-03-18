<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import MessageSquare from 'lucide-svelte/icons/message-square';
</script>

<div class="flex-1 flex items-center justify-center p-8">
  <Card.Root class="p-8 text-center max-w-md">
    <div class="flex flex-col items-center gap-4">
      <MessageSquare class="h-12 w-12 text-muted-foreground" />
      <div>
        <Card.Title class="text-lg mb-2">Select a session</Card.Title>
        <Card.Description>
          Choose a project and session from the sidebar to start chatting.
        </Card.Description>
      </div>
    </div>
  </Card.Root>
</div>
