<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import * as Sidebar from '$lib/components/ui/sidebar/index.js';
  import * as Collapsible from '$lib/components/ui/collapsible/index.js';
  import { on } from '$lib/stores/connection';
  import { sessions } from '$lib/stores/chat';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
  import Settings from 'lucide-svelte/icons/settings';
  import Plus from 'lucide-svelte/icons/plus';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import Archive from 'lucide-svelte/icons/archive';
  import Circle from 'lucide-svelte/icons/circle';
  import CircleCheck from 'lucide-svelte/icons/circle-check';

  type SessionStatus = 'active' | 'done' | 'archived';

  interface Project {
    name: string;
    sessions: Session[];
    expanded: boolean;
  }

  interface Session {
    id: string;
    name: string;
    status: SessionStatus;
  }

  const STAGGER_MAX = 8;

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

  // Optimistically add the current session to the sidebar when navigating to a new thread
  // Track archived sessions to avoid re-adding them before navigation completes
  const archivedIds = new Set<string>();
  $effect(() => {
    if (!currentProject || !currentSession) return;
    if (archivedIds.has(currentSession)) return;
    const proj = projects.find(p => p.name === currentProject);
    if (!proj) return;
    if (proj.sessions.some(s => s.id === currentSession)) return;
    // Session not in list yet — add it optimistically using the first user message as the name
    const chatSession = $sessions.get(currentSession);
    const firstUserMsg = chatSession?.messages.find(m => m.role === 'user');
    const name = firstUserMsg?.content.replace(/\n/g, ' ').slice(0, 50) || 'New conversation';
    proj.sessions = [{ id: currentSession, name, status: 'active' as SessionStatus }, ...proj.sessions];
    projects = [...projects];
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
      const res = await fetch(`/api/sessions?project=${encodeURIComponent(project)}&platform=web`);
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        return items.map((s: any) => ({
          id: s.thread_id ?? s.id ?? s.session_id ?? '',
          name: s.name ?? '',
          status: (s.status ?? 'active') as SessionStatus,
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

  async function archiveSession(projectName: string, sessionId: string) {
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to archive');
      archivedIds.add(sessionId);
      const proj = projects.find(p => p.name === projectName);
      if (proj) {
        proj.sessions = proj.sessions.filter(s => s.id !== sessionId);
        projects = [...projects];
      }
      // Navigate away if archiving the current session
      if (currentSession === sessionId) {
        goto(`/chat/${encodeURIComponent(projectName)}`);
      }
      toast.success('Session archived');
    } catch {
      toast.error('Failed to archive session');
    }
  }
</script>

<Sidebar.Root collapsible="none" class="overflow-x-hidden">
  <!-- C1 fix: Logo with brand icon, clickable, better spacing -->
  <Sidebar.Header class="h-10 flex-row items-center px-4">
    <div class="flex items-center gap-1.5 select-none">
      <svg class="size-4" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 20l8-8 8 8" stroke="#4cc9f0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="17" y1="26" x2="25" y2="26" stroke="#a1a1aa" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <span class="text-sm font-semibold tracking-tight text-sidebar-foreground">cc2im</span>
    </div>
  </Sidebar.Header>
  <div class="mx-3 h-px bg-sidebar-border"></div>

  <Sidebar.Content>
    <Sidebar.Group>
      <Sidebar.GroupContent>
        {#if loading}
          <p class="px-2 py-2 text-xs text-sidebar-foreground/60">Loading…</p>
        {:else if projects.length === 0}
          <!-- L2 fix: empty state with guidance -->
          <div class="px-2 py-3 text-xs text-sidebar-foreground/50">
            <p>No projects yet.</p>
            <p class="mt-1 text-sidebar-foreground/40">Start a chat to create one.</p>
          </div>
        {:else}
          {#each projects as project (project.name)}
            <div class="mb-2">
            <Collapsible.Root bind:open={project.expanded}>
              <Sidebar.Menu>
                <Sidebar.MenuItem>
                  <Sidebar.MenuButton
                    onclick={() => { project.expanded = !project.expanded; }}
                    class="font-medium"
                  >
                    <ChevronRight
                      class="size-4 shrink-0 transition-transform duration-200 {project.expanded ? 'rotate-90' : ''}"
                    />
                    <span class="truncate">{project.name}</span>
                  </Sidebar.MenuButton>
                  <Sidebar.MenuAction
                    title="New session"
                    aria-label="New session in {project.name}"
                    onclick={() => createSession(project.name)}
                  >
                    <Plus class="size-3.5" />
                  </Sidebar.MenuAction>
                </Sidebar.MenuItem>
              </Sidebar.Menu>

              <Collapsible.Content>
                <Sidebar.Menu class="mt-1">
                  {#each project.sessions as session, i (session.id)}
                    <Sidebar.MenuItem
                      class={i < STAGGER_MAX ? 'animate-fade-up' : ''}
                      style={i < STAGGER_MAX ? `animation-delay: ${i * 50}ms` : ''}
                    >
                      <Sidebar.MenuButton
                        class="pe-8"
                        isActive={currentProject === project.name && currentSession === session.id}
                        onclick={() => goto(`/chat/${encodeURIComponent(project.name)}/${encodeURIComponent(session.id)}`)}
                        title={session.name || session.id}
                      >
                        <span class="flex items-center justify-center !size-4 shrink-0">
                          {#if session.status === 'done'}
                            <CircleCheck class="!size-2 text-emerald-500/70" />
                          {:else}
                            <Circle class="!size-2 text-sidebar-foreground/30" />
                          {/if}
                        </span>
                        <span class="min-w-0 truncate">{session.name || session.id}</span>
                      </Sidebar.MenuButton>
                      <Sidebar.MenuAction
                        showOnHover
                        title="Archive session"
                        aria-label="Archive session: {session.name || session.id}"
                        onclick={() => archiveSession(project.name, session.id)}
                      >
                        <Archive class="size-3.5" />
                      </Sidebar.MenuAction>
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
            </div>
          {/each}
        {/if}
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <div class="mx-3 h-px bg-sidebar-border"></div>
  <Sidebar.Footer class="bg-sidebar-accent/30">
    <Sidebar.Menu>
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
