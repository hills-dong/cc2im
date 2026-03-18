<script lang="ts">
  import { page } from '$app/stores';
  import * as Card from '$lib/components/ui/card';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import Plus from 'lucide-svelte/icons/plus';

  let project = $derived($page.params.project);
</script>

<div class="flex-1 flex items-center justify-center p-8">
  <Card.Root class="p-8 text-center max-w-md">
    <div class="flex flex-col items-center gap-4">
      <MessageSquare class="h-12 w-12 text-muted-foreground" />
      <div>
        <Card.Title class="text-lg mb-2">{project}</Card.Title>
        <Card.Description>
          Select a session from the sidebar or create a new one to start chatting.
        </Card.Description>
      </div>
      <div class="flex items-center gap-1 text-sm text-muted-foreground">
        <Plus class="h-4 w-4" />
        <span>Use the sidebar to create a new session</span>
      </div>
    </div>
  </Card.Root>
</div>
