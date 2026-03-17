<script lang="ts">
  import { onMount } from "svelte";
  import { currentProject, currentSessionId } from "./stores/chat.js";
  import { on } from "./stores/connection.js";

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
    return text.length > max ? text.slice(0, max) + "..." : text;
  }

  let {
    currentPage,
    onPageChange,
    onSessionSelect,
  }: {
    currentPage: string;
    onPageChange: (page: "chat" | "config" | "stats") => void;
    onSessionSelect: (project: string, sessionId: string | null) => void;
  } = $props();

  let projects = $state<Project[]>([]);
  let loading = $state(true);

  onMount(async () => {
    await loadProjects();
    on("session.update", async (event: any) => {
      if (!event.project) return;
      // Reload sessions for the affected project
      const proj = projects.find(p => p.name === event.project);
      if (proj) {
        proj.sessions = await loadSessions(proj.name);
        projects = [...projects]; // trigger reactivity
      }
    });
  });

  async function loadProjects() {
    loading = true;
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : [];
        projects = await Promise.all(
          items.map(async (item: any) => {
            const name = typeof item === "string" ? item : item.name;
            const sessions = await loadSessions(name);
            return { name, sessions, expanded: true };
          })
        );
      }
    } catch (e) {
      console.error("Failed to load projects", e);
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
          id: s.thread_id ?? s.id ?? s.session_id ?? "",
          name: s.name ?? "",
        }));
      }
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
    return [];
  }

  async function createSession(project: string) {
    onSessionSelect(project, null);
  }

  function toggleProject(project: Project) {
    project.expanded = !project.expanded;
  }
</script>

<aside class="sidebar">
  <div class="sidebar-header">
    <span class="app-name">cc2im</span>
  </div>

  <div class="sidebar-projects">
    {#if loading}
      <div class="sidebar-loading">Loading…</div>
    {:else if projects.length === 0}
      <div class="sidebar-empty">No projects found</div>
    {:else}
      {#each projects as project (project.name)}
        <div class="project-section">
          <div class="project-header" role="none">
            <button class="project-toggle" onclick={() => toggleProject(project)}>
              <span class="project-arrow">{project.expanded ? "▾" : "▸"}</span>
              <span class="project-name">{project.name}</span>
            </button>
            <button
              class="new-session-btn"
              title="New session"
              onclick={() => createSession(project.name)}
            >+</button>
          </div>

          {#if project.expanded}
            <div class="sessions-list">
              {#each project.sessions as session (session.id)}
                <button
                  class="session-item"
                  class:active={$currentProject === project.name && $currentSessionId === session.id}
                  onclick={() => onSessionSelect(project.name, session.id)}
                  title={session.name || session.id}
                >
                  {truncate(session.name || session.id)}
                </button>
              {/each}
              {#if project.sessions.length === 0}
                <span class="no-sessions">No sessions yet</span>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="sidebar-bottom">
    <div class="sidebar-divider"></div>
    <button
      class="nav-btn"
      class:active={currentPage === "chat"}
      onclick={() => onPageChange("chat")}
    >
      💬 Chat
    </button>
    <button
      class="nav-btn"
      class:active={currentPage === "config"}
      onclick={() => onPageChange("config")}
    >
      ⚙ Config
    </button>
    <button
      class="nav-btn"
      class:active={currentPage === "stats"}
      onclick={() => onPageChange("stats")}
    >
      📊 Stats
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-header {
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .app-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.05em;
  }

  .sidebar-projects {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .sidebar-loading,
  .sidebar-empty {
    padding: 16px;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .project-section {
    margin-bottom: 4px;
  }

  .project-header {
    display: flex;
    align-items: center;
    padding: 2px 12px 2px 0;
    gap: 4px;
  }

  .project-toggle {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 4px;
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    padding: 4px 12px;
    text-align: left;
    min-width: 0;
  }

  .project-toggle:hover {
    color: var(--text-primary);
  }

  .project-arrow {
    font-size: 10px;
    width: 12px;
    flex-shrink: 0;
  }

  .project-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .new-session-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    border-radius: 3px;
    width: 18px;
    height: 18px;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0;
  }

  .new-session-btn:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  .sessions-list {
    padding: 2px 0 4px 24px;
  }

  .session-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-secondary);
    padding: 5px 10px;
    cursor: pointer;
    font-size: 13px;
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .session-item:hover {
    background: rgba(76, 201, 240, 0.08);
    color: var(--text-primary);
  }

  .session-item.active {
    background: rgba(76, 201, 240, 0.15);
    color: var(--accent);
  }

  .no-sessions {
    font-size: 12px;
    color: var(--text-secondary);
    padding: 4px 10px;
    opacity: 0.6;
  }

  .sidebar-bottom {
    flex-shrink: 0;
    padding: 8px 0;
  }

  .sidebar-divider {
    height: 1px;
    background: var(--border);
    margin-bottom: 8px;
  }

  .nav-btn {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-secondary);
    padding: 7px 16px;
    cursor: pointer;
    font-size: 13px;
  }

  .nav-btn:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
  }

  .nav-btn.active {
    color: var(--accent);
    background: rgba(76, 201, 240, 0.1);
  }
</style>
