<script lang="ts">
  import { setMode } from 'mode-watcher';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Monitor from 'lucide-svelte/icons/monitor';
  import { Button } from '$lib/components/ui/button';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    <Button variant="ghost" size="icon-sm">
      <Sun class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span class="sr-only">Toggle theme</span>
    </Button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.Item onclick={() => setMode('light')}>
      <Sun class="mr-2 h-4 w-4" />
      Light
    </DropdownMenu.Item>
    <DropdownMenu.Item onclick={() => setMode('dark')}>
      <Moon class="mr-2 h-4 w-4" />
      Dark
    </DropdownMenu.Item>
    <DropdownMenu.Item onclick={() => setMode('system')}>
      <Monitor class="mr-2 h-4 w-4" />
      System
    </DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
