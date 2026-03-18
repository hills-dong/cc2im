<script lang="ts">
  import { connectionStatus } from '$lib/stores/connection';
  import { Badge } from '$lib/components/ui/badge';

  let status = $derived($connectionStatus);

  const statusConfig = {
    connected: { label: 'Connected', variant: 'default' as const, class: 'bg-green-600' },
    connecting: { label: 'Connecting...', variant: 'secondary' as const, class: 'bg-yellow-600' },
    disconnected: { label: 'Disconnected', variant: 'destructive' as const, class: '' }
  };

  let config = $derived(statusConfig[status] ?? statusConfig.disconnected);
</script>

<div class="flex items-center gap-2 px-4 py-1 border-t border-border bg-background text-xs text-muted-foreground">
  <Badge variant={config.variant} class="h-5 text-[10px] {config.class}">
    {config.label}
  </Badge>
</div>
