<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import * as Collapsible from '$lib/components/ui/collapsible/index.js';
  import { Button } from '$lib/components/ui/button/index.js';
  import { on } from '$lib/stores/connection';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
  import Settings from 'lucide-svelte/icons/settings';
  import Plus from 'lucide-svelte/icons/plus';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';

  interface Project {
    name: string;
    sessions: Session[];
    expanded: boolean;
  }

  interface Session {
    id: string;
    name: string;
  }

  function truncate(text: string, max = 27): string {
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  let projects = $state<Project[]>([]);
  let loading = $state(true);

  let activePage = $derived(
    $page.url.pathname.startsWith('/chat') ? 'chat' :
    $page.url.pathname.startsWith('/stats') ? 'stats' :
    $page.url.pathname.startsWith('/config') ? 'config' : 'chat'
  );
  let currentProject = $derived($page.params.project ?? '');
  let currentSession = $derived($page.params.session ?? '');

  onMount(async () => {
    await loadProjects();
    on('session.update', async (event: any) => {
      if (!event.project) return;
      const proj = projects.find(p => p.name === event.project);
      if (proj) {
        proj.sessions = await loadSessions(proj.name);
        projects = [...projects];
      }
    });
  });

  async function loadProjects() {
    loading = true;
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        projects = await Promise.all(
          items.map(async (item: any) => {
            const name = typeof item === 'string' ? item : item.name;
            const sessions = await loadSessions(name);
            return { name, sessions, expanded: true };
          })
        );
      }
    } catch (e) {
      console.error('Failed to load projects', e);
    } finally {
      loading = false;
    }
  }

  async function loadSessions(project: string): Promise<Session[]> {
    try {
      const res = await fetch(`/api/sessions?project=${encodeURIComponent(project)}`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        return items.map((s: any) => ({
          id: s.thread_id ?? s.id ?? s.session_id ?? '',
          name: s.name ?? '',
        }));
      }
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
    return [];
  }

  function createSession(project: string) {
    goto(`/chat/${encodeURIComponent(project)}`);
  }
</script>

<Sidebar.Root collapsible="none">
  <Sidebar.Header>
    <span class="px-2 py-1 text-base font-bold tracking-wide text-sidebar-foreground">cc2im</span>
  </Sidebar.Header>

  <Sidebar.Content>
    <!-- Projects section -->
    <Sidebar.Group>
      <Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        {#if loading}
          <p class="px-2 py-2 text-xs text-sidebar-foreground/60">Loading…</p>
        {:else if projects.length === 0}
          <p class="px-2 py-2 text-xs text-sidebar-foreground/60">No projects found</p>
        {:else}
          {#each projects as project (project.name)}
            <Collapsible.Root bind:open={project.expanded}>
              <Sidebar.Menu>
                <Sidebar.MenuItem>
                  <div class="flex items-center w-full">
                    <Collapsible.Trigger class="flex flex-1 items-center gap-1 min-w-0">
                      <ChevronRight
                        class="size-3 shrink-0 transition-transform duration-200 {project.expanded ? 'rotate-90' : ''}"
                      />
                      <span class="truncate text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
                        {project.name}
                      </span>
                    </Collapsible.Trigger>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-5 shrink-0 ml-1"
                      title="New session"
                      onclick={() => createSession(project.name)}
                    >
                      <Plus class="size-3" />
                    </Button>
                  </div>
                </Sidebar.MenuItem>
              </Sidebar.Menu>

              <Collapsible.Content>
                <Sidebar.Menu class="ms-4">
                  {#each project.sessions as session (session.id)}
                    <Sidebar.MenuItem>
                      <Sidebar.MenuButton
                        isActive={currentProject === project.name && currentSession === session.id}
                        onclick={() => goto(`/chat/${encodeURIComponent(project.name)}/${encodeURIComponent(session.id)}`)}
                        title={session.name || session.id}
                        size="sm"
                      >
                        <span class="truncate">{truncate(session.name || session.id)}</span>
                      </Sidebar.MenuButton>
                    </Sidebar.MenuItem>
                  {/each}
                  {#if project.sessions.length === 0}
                    <Sidebar.MenuItem>
                      <span class="px-2 py-1 text-xs text-sidebar-foreground/40">No sessions yet</span>
                    </Sidebar.MenuItem>
                  {/if}
                </Sidebar.Menu>
              </Collapsible.Content>
            </Collapsible.Root>
          {/each}
        {/if}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer>
    <Sidebar.Separator />
    <Sidebar.Menu>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={activePage === 'chat'}
          onclick={() => goto('/chat')}
        >
          <MessageSquare />
          <span>Chat</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={activePage === 'stats'}
          onclick={() => goto('/stats')}
        >
          <BarChart3 />
          <span>Stats</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
      <Sidebar.MenuItem>
        <Sidebar.MenuButton
          isActive={activePage === 'config'}
          onclick={() => goto('/config')}
        >
          <Settings />
          <span>Config</span>
        </Sidebar.MenuButton>
      </Sidebar.MenuItem>
    </Sidebar.Menu>
  </Sidebar.Footer>
</Sidebar.Root>
