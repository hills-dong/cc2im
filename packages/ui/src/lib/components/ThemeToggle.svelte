<script lang="ts">
  import { toggleMode } from 'mode-watcher';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import { Button } from '$lib/components/ui/button';
</script>

<Button variant="ghost" size="icon-sm" onclick={toggleMode} title="Toggle theme">
  <Sun class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
  <Moon class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
  <span class="sr-only">Toggle theme</span>
</Button>
