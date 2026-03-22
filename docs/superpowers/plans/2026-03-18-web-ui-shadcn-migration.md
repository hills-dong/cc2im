# Web UI shadcn-svelte Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate packages/ui from vanilla Svelte 5 + Vite to SvelteKit + shadcn-svelte + Tailwind CSS with file-based routing and light/dark theme support.

**Architecture:** SvelteKit with adapter-static (SPA mode, no SSR). shadcn-svelte New York style with Zinc neutral + Cyan accent. Route-driven state replaces manual page switching. Stores preserved except currentProject/currentSessionId (replaced by $page.params).

**Tech Stack:** SvelteKit, shadcn-svelte, Tailwind CSS, bits-ui, mode-watcher, lucide-svelte, svelte-sonner

**Spec:** `docs/superpowers/specs/2026-03-18-web-ui-shadcn-migration-design.md`

---

## File Structure

### New files to create
| File | Responsibility |
|---|---|
| `packages/ui/src/routes/+layout.svelte` | Global layout: sidebar, theme toggle, status bar, onboarding, toast |
| `packages/ui/src/routes/+layout.ts` | Disable SSR globally |
| `packages/ui/src/routes/+page.svelte` | Root redirect to /chat |
| `packages/ui/src/routes/chat/+page.svelte` | /chat empty state |
| `packages/ui/src/routes/chat/[project]/+page.svelte` | /chat/:project session list |
| `packages/ui/src/routes/chat/[project]/[session]/+page.svelte` | /chat/:project/:session chat view |
| `packages/ui/src/routes/stats/+page.svelte` | /stats token statistics |
| `packages/ui/src/routes/config/+page.svelte` | /config settings |
| `packages/ui/src/lib/components/ThemeToggle.svelte` | Light/dark/system theme switcher |
| `packages/ui/src/lib/components/StatusBar.svelte` | WebSocket connection status |
| `packages/ui/tailwind.config.ts` | Tailwind config with shadcn preset |
| `packages/ui/postcss.config.cjs` | PostCSS config for Tailwind |

### Files to modify
| File | Changes |
|---|---|
| `packages/ui/package.json` | Add SvelteKit + shadcn deps, remove vite-plugin-svelte, update scripts |
| `packages/ui/svelte.config.js` | SvelteKit config with adapter-static |
| `packages/ui/vite.config.ts` | SvelteKit vite config |
| `packages/ui/tsconfig.json` | SvelteKit TypeScript paths |
| `packages/ui/src/app.html` | SvelteKit template with %sveltekit.head% and %sveltekit.body% |
| `packages/ui/src/app.css` | Tailwind directives + shadcn theme variables |
| `packages/ui/src/lib/stores/chat.ts` | Remove currentProject/currentSessionId exports (sendMessage already takes params) |
| `packages/ui/src/lib/ChatInput.svelte` | Rewrite with shadcn Textarea + Button |
| `packages/ui/src/lib/MessageBubble.svelte` | Rewrite with shadcn Card + Badge |
| `packages/ui/src/lib/Onboarding.svelte` | Rewrite with shadcn Dialog + form components |
| `packages/ui/tests/chat.test.ts` | Update for store changes |

### Files to delete
| File | Reason |
|---|---|
| `packages/ui/src/main.ts` | SvelteKit handles mounting |
| `packages/ui/index.html` | Replaced by src/app.html |
| `packages/ui/src/App.svelte` | Replaced by routes/+layout.svelte |
| `packages/ui/src/lib/Sidebar.svelte` | Rebuilt in +layout.svelte |
| `packages/ui/src/lib/Chat.svelte` | Rebuilt as chat route pages |
| `packages/ui/src/lib/Stats.svelte` | Rebuilt as /stats route |
| `packages/ui/src/lib/Config.svelte` | Rebuilt as /config route |
| `packages/ui/src/vite-env.d.ts` | SvelteKit auto-generates types |

---

## Task 1: SvelteKit Project Bootstrap

Convert the vanilla Svelte + Vite project to SvelteKit. No UI changes yet — just get SvelteKit running with a minimal page.

**Files:**
- Modify: `packages/ui/package.json`
- Modify: `packages/ui/svelte.config.js`
- Modify: `packages/ui/vite.config.ts`
- Modify: `packages/ui/tsconfig.json`
- Modify: `packages/ui/src/app.html`
- Create: `packages/ui/src/routes/+layout.svelte`
- Create: `packages/ui/src/routes/+layout.ts`
- Create: `packages/ui/src/routes/+page.svelte`
- Delete: `packages/ui/src/main.ts`
- Delete: `packages/ui/index.html`
- Delete: `packages/ui/src/vite-env.d.ts`

- [ ] **Step 1: Install SvelteKit and dependencies**

```bash
cd packages/ui
npm install --save-dev @sveltejs/kit @sveltejs/adapter-static
```

- [ ] **Step 2: Update package.json scripts**

In `packages/ui/package.json`, replace the scripts block:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

Also remove `@sveltejs/vite-plugin-svelte` from devDependencies.

```bash
cd packages/ui && npm uninstall @sveltejs/vite-plugin-svelte
```

- [ ] **Step 3: Rewrite svelte.config.js**

Replace `packages/ui/svelte.config.js` entirely:

```javascript
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/kit/vite';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'dist',
      assets: 'dist',
      fallback: 'index.html'
    }),
    alias: {
      '$lib': 'src/lib'
    }
  }
};

export default config;
```

- [ ] **Step 4: Rewrite vite.config.ts**

Replace `packages/ui/vite.config.ts` entirely:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['tests/**/*.test.ts']
  }
});
```

- [ ] **Step 5: Update tsconfig.json**

Replace `packages/ui/tsconfig.json`:

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 6: Update app.html for SvelteKit**

Replace `packages/ui/src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>cc2im</title>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- [ ] **Step 7: Create +layout.ts to disable SSR**

Create `packages/ui/src/routes/+layout.ts`:

```typescript
export const ssr = false;
export const prerender = false;
```

- [ ] **Step 8: Create minimal +layout.svelte**

Create `packages/ui/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<div class="app">
  {@render children()}
</div>

<style>
  .app {
    height: 100vh;
    display: flex;
  }
</style>
```

- [ ] **Step 9: Create root +page.svelte with redirect**

Create `packages/ui/src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/chat', { replaceState: true });
  });
</script>
```

- [ ] **Step 10: Delete old entry files**

```bash
cd packages/ui
rm -f src/main.ts index.html src/vite-env.d.ts
```

- [ ] **Step 11: Verify SvelteKit boots**

```bash
cd packages/ui && npm run dev
```

Expected: SvelteKit dev server starts, navigating to `http://localhost:5173` redirects to `/chat` (404 page is fine — route not created yet).

- [ ] **Step 12: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): bootstrap SvelteKit with adapter-static SPA mode"
```

---

## Task 2: Tailwind CSS + shadcn-svelte Setup

Install Tailwind CSS and initialize shadcn-svelte with New York style + Zinc + Cyan accent.

**Files:**
- Modify: `packages/ui/package.json` (via npm install)
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/postcss.config.cjs`
- Modify: `packages/ui/src/app.css`
- Create: `packages/ui/src/lib/components/ui/` (via shadcn CLI)

- [ ] **Step 1: Install Tailwind CSS and shadcn-svelte dependencies**

```bash
cd packages/ui
npm install --save-dev tailwindcss postcss autoprefixer tailwindcss-animate
npm install bits-ui clsx tailwind-merge mode-watcher lucide-svelte svelte-sonner
```

- [ ] **Step 2: Run shadcn-svelte init first (generates config files)**

Run the CLI init first — it will scaffold tailwind.config, postcss.config, utils.ts, and app.css:

```bash
cd packages/ui
npx shadcn-svelte@latest init --style new-york --base-color zinc --css-variables
```

Accept defaults for component path (`src/lib/components/ui`). This creates the base config files that we'll customize next.

- [ ] **Step 3: Add shadcn-svelte components**

```bash
cd packages/ui
npx shadcn-svelte@latest add button card badge input label textarea tabs table scroll-area collapsible accordion dialog dropdown-menu separator sidebar sonner switch
```

- [ ] **Step 4: Customize tailwind.config.ts for Cyan accent + sidebar colors**

After init, edit `packages/ui/tailwind.config.ts` to add sidebar color mappings and ensure Cyan primary. The init-generated file has most of the structure — add to the `extend.colors` section:

```typescript
sidebar: {
  DEFAULT: 'hsl(var(--sidebar-background))',
  foreground: 'hsl(var(--sidebar-foreground))',
  primary: 'hsl(var(--sidebar-primary))',
  'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  accent: 'hsl(var(--sidebar-accent))',
  'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  border: 'hsl(var(--sidebar-border))',
  ring: 'hsl(var(--sidebar-ring))'
}
```

- [ ] **Step 5: Replace app.css with custom Cyan accent theme + highlight.js**

Replace `packages/ui/src/app.css` entirely:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 193 86% 63%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 193 86% 63%;
    --radius: 0.5rem;

    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 193 86% 63%;
    --sidebar-primary-foreground: 0 0% 98%;
    --sidebar-accent: 240 4.8% 95.9%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 220 13% 91%;
    --sidebar-ring: 193 86% 63%;
  }

  .dark {
    --background: 240 33% 14%;
    --foreground: 0 0% 88%;
    --card: 215 43% 16%;
    --card-foreground: 0 0% 88%;
    --popover: 215 43% 16%;
    --popover-foreground: 0 0% 88%;
    --primary: 193 86% 63%;
    --primary-foreground: 240 33% 14%;
    --secondary: 240 20% 20%;
    --secondary-foreground: 0 0% 88%;
    --muted: 240 20% 20%;
    --muted-foreground: 240 5% 65%;
    --accent: 240 20% 20%;
    --accent-foreground: 0 0% 88%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 88%;
    --border: 240 20% 26%;
    --input: 240 20% 26%;
    --ring: 193 86% 63%;

    --sidebar-background: 215 43% 16%;
    --sidebar-foreground: 0 0% 88%;
    --sidebar-primary: 193 86% 63%;
    --sidebar-primary-foreground: 215 43% 16%;
    --sidebar-accent: 240 20% 20%;
    --sidebar-accent-foreground: 0 0% 88%;
    --sidebar-border: 240 20% 26%;
    --sidebar-ring: 193 86% 63%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  code, pre {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
  }
}

/* highlight.js dark theme overrides */
.dark .hljs {
  background: hsl(215 43% 16%);
  color: #e0e0e0;
}
.dark .hljs-keyword { color: #c792ea; }
.dark .hljs-string { color: #c3e88d; }
.dark .hljs-number { color: #f78c6c; }
.dark .hljs-comment { color: #546e7a; }
.dark .hljs-function { color: #82aaff; }
.dark .hljs-title { color: #ffcb6b; }
.dark .hljs-built_in { color: #89ddff; }
.dark .hljs-attr { color: #ffcb6b; }
.dark .hljs-params { color: #e0e0e0; }

/* highlight.js light theme overrides */
.hljs {
  background: hsl(0 0% 97%);
  color: #1a1a2e;
}
```

- [ ] **Step 6: Verify Tailwind + shadcn setup**

Update `packages/ui/src/routes/+page.svelte` temporarily:

```svelte
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
</script>

<div class="flex items-center justify-center h-screen">
  <Button>Test shadcn Button</Button>
</div>
```

```bash
cd packages/ui && npm run dev
```

Expected: Page shows a styled button with New York theme.

- [ ] **Step 7: Revert test page, restore redirect**

Restore `packages/ui/src/routes/+page.svelte` to the redirect version from Task 1 Step 9.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/
git commit -m "feat(ui): add Tailwind CSS + shadcn-svelte with New York/Zinc/Cyan theme"
```

---

## Task 3: Theme Switching + Global Utilities

Add light/dark/system theme toggle with mode-watcher and toast notifications with svelte-sonner.

**Files:**
- Modify: `packages/ui/src/routes/+layout.svelte`
- Create: `packages/ui/src/lib/components/ThemeToggle.svelte`
- Create: `packages/ui/src/lib/components/StatusBar.svelte`

- [ ] **Step 1: Create ThemeToggle component**

Create `packages/ui/src/lib/components/ThemeToggle.svelte`:

```svelte
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
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
        <Sun class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span class="sr-only">Toggle theme</span>
      </Button>
    {/snippet}
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
```

**Note:** shadcn-svelte v1+ (Svelte 5) uses `{#snippet child({ props })}` pattern instead of the old `asChild let:builder` / `builders={[builder]}`. Use this Svelte 5 API throughout all components.

- [ ] **Step 2: Create StatusBar component**

Create `packages/ui/src/lib/components/StatusBar.svelte`:

```svelte
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
```

- [ ] **Step 3: Update +layout.svelte with theme, toast, status bar**

Replace `packages/ui/src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import { connect } from '$lib/stores/connection';
  import '../app.css';

  let { children } = $props();
  let isTauri = $state(false);

  onMount(() => {
    isTauri = '__TAURI__' in window;

    // Connect WebSocket
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    connect(`${wsProto}://${location.host}/ws`);
  });
</script>

<ModeWatcher />
<Toaster />

<div class="flex flex-col h-screen">
  {#if isTauri}
    <div class="h-8 bg-sidebar flex items-center px-3 text-xs text-sidebar-foreground" data-tauri-drag-region>
      <span class="font-semibold">cc2im</span>
      <div class="ml-auto">
        <ThemeToggle />
      </div>
    </div>
  {/if}

  <div class="flex flex-1 overflow-hidden">
    <!-- Sidebar will be added in Task 5 -->
    <main class="flex-1 flex flex-col overflow-hidden">
      {@render children()}
    </main>
  </div>

  <StatusBar />
</div>
```

- [ ] **Step 4: Verify theme toggle works**

```bash
cd packages/ui && npm run dev
```

Expected: Page loads, theme toggle in titlebar area switches between light/dark/system. Status bar shows connection status at bottom.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/components/ThemeToggle.svelte packages/ui/src/lib/components/StatusBar.svelte packages/ui/src/routes/+layout.svelte
git commit -m "feat(ui): add theme switching (light/dark/system) and status bar"
```

---

## Task 4: Store Migration (chat.ts)

Remove `currentProject`/`currentSessionId` store exports. Note: `sendMessage(project, message, sessionId?)` and `loadSession(baseUrl, threadId, project)` already take params — no signature changes needed. The stores are only used by UI components (Sidebar, Chat, App) which are being replaced by route-driven state.

**Key facts about the actual store code:**
- `sendMessage(project: string, message: string, sessionId?: string)` — already parameterized
- `loadSession(baseUrl: string, threadId: string, project: string)` — takes baseUrl as first param
- Session map key: `sessionId` or `new-${project}` for new sessions (no `::` separator)

**Files:**
- Modify: `packages/ui/src/lib/stores/chat.ts`
- Modify: `packages/ui/tests/chat.test.ts`

- [ ] **Step 1: Remove currentProject and currentSessionId from chat.ts**

In `packages/ui/src/lib/stores/chat.ts`, remove lines 21-22:

```typescript
// DELETE these two lines:
export const currentProject = writable<string | null>(null);
export const currentSessionId = writable<string | null>(null);
```

No other changes needed — `sendMessage` and `loadSession` don't read from these stores.

- [ ] **Step 2: Run tests to verify they still pass**

```bash
cd packages/ui && npm run test
```

Expected: All tests PASS. The tests don't import or test `currentProject`/`currentSessionId`.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/stores/chat.ts
git commit -m "refactor(ui): remove unused currentProject/currentSessionId store exports"
```

---

## Task 5: Sidebar with shadcn-svelte

Rebuild Sidebar using shadcn Sidebar + Collapsible components in the layout.

**Files:**
- Create: `packages/ui/src/lib/components/AppSidebar.svelte`
- Modify: `packages/ui/src/routes/+layout.svelte`
- Delete: `packages/ui/src/lib/Sidebar.svelte`

- [ ] **Step 1: Create AppSidebar component**

Create `packages/ui/src/lib/components/AppSidebar.svelte`:

Port the logic from the current `Sidebar.svelte` (343 lines) into shadcn components. Key mapping:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import * as Sidebar from '$lib/components/ui/sidebar';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import { Button } from '$lib/components/ui/button';
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
  import Settings from 'lucide-svelte/icons/settings';
  import Plus from 'lucide-svelte/icons/plus';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { on } from '$lib/stores/connection';

  interface Project { name: string; id: string; }
  interface SessionInfo { id: string; name?: string; platform?: string; }

  let projects: Project[] = $state([]);
  let projectSessions: Record<string, SessionInfo[]> = $state({});
  let expandedProjects: Set<string> = $state(new Set());

  // Current route params
  let currentProject = $derived($page.params.project ?? '');
  let currentSession = $derived($page.params.session ?? '');

  // Determine active nav item from current path
  let activePage = $derived(
    $page.url.pathname.startsWith('/chat') ? 'chat' :
    $page.url.pathname.startsWith('/stats') ? 'stats' :
    $page.url.pathname.startsWith('/config') ? 'config' : 'chat'
  );

  onMount(() => {
    loadProjects();

    // Listen for session updates
    const unsub = on('session.update', (data: any) => {
      if (data.project && data.session) {
        loadSessions(data.project);
      }
    });

    return unsub;
  });

  async function loadProjects() {
    const res = await fetch('/api/projects');
    if (res.ok) projects = await res.json();
  }

  async function loadSessions(projectName: string) {
    const res = await fetch(`/api/sessions?project=${encodeURIComponent(projectName)}`);
    if (res.ok) {
      projectSessions[projectName] = await res.json();
    }
  }

  function toggleProject(projectName: string) {
    const next = new Set(expandedProjects);
    if (next.has(projectName)) {
      next.delete(projectName);
    } else {
      next.add(projectName);
      if (!projectSessions[projectName]) loadSessions(projectName);
    }
    expandedProjects = next;
  }

  async function createSession(projectName: string) {
    // Create a new session via navigation — the chat page will handle creation
    goto(`/chat/${encodeURIComponent(projectName)}`);
  }

  function selectSession(projectName: string, sessionId: string) {
    goto(`/chat/${encodeURIComponent(projectName)}/${encodeURIComponent(sessionId)}`);
  }
</script>

<Sidebar.Root>
  <Sidebar.Header class="p-3">
    <h2 class="text-sm font-semibold text-sidebar-foreground">cc2im</h2>
  </Sidebar.Header>

  <Sidebar.Content>
    <!-- Navigation -->
    <Sidebar.Group>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              class={activePage === 'chat' ? 'bg-sidebar-accent' : ''}
              onclick={() => goto('/chat')}
            >
              <MessageSquare class="h-4 w-4" />
              <span>Chat</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              class={activePage === 'stats' ? 'bg-sidebar-accent' : ''}
              onclick={() => goto('/stats')}
            >
              <BarChart3 class="h-4 w-4" />
              <span>Stats</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
          <Sidebar.MenuItem>
            <Sidebar.MenuButton
              class={activePage === 'config' ? 'bg-sidebar-accent' : ''}
              onclick={() => goto('/config')}
            >
              <Settings class="h-4 w-4" />
              <span>Config</span>
            </Sidebar.MenuButton>
          </Sidebar.MenuItem>
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>

    <Sidebar.Separator />

    <!-- Projects & Sessions -->
    <Sidebar.Group>
      <Sidebar.GroupLabel>Projects</Sidebar.GroupLabel>
      <Sidebar.GroupContent>
        <Sidebar.Menu>
          {#each projects as project}
            <Collapsible.Root
              open={expandedProjects.has(project.name)}
              onOpenChange={() => toggleProject(project.name)}
            >
              <Sidebar.MenuItem>
                <Collapsible.Trigger>
                  {#snippet child({ props })}
                    <Sidebar.MenuButton {...props}
                      class={currentProject === project.name ? 'bg-sidebar-accent' : ''}
                    >
                      <ChevronRight class="h-4 w-4 transition-transform {expandedProjects.has(project.name) ? 'rotate-90' : ''}" />
                      <span class="truncate">{project.name}</span>
                    </Sidebar.MenuButton>
                  {/snippet}
                </Collapsible.Trigger>

                <Collapsible.Content>
                  <Sidebar.MenuSub>
                    {#each (projectSessions[project.name] ?? []) as session}
                      <Sidebar.MenuSubItem>
                        <Sidebar.MenuSubButton
                          class={currentSession === session.id ? 'bg-sidebar-accent' : ''}
                          onclick={() => selectSession(project.name, session.id)}
                        >
                          <span class="truncate">{session.name ?? session.id}</span>
                        </Sidebar.MenuSubButton>
                      </Sidebar.MenuSubItem>
                    {/each}
                    <Sidebar.MenuSubItem>
                      <Button variant="ghost" size="sm" class="w-full justify-start text-xs text-muted-foreground"
                        onclick={() => createSession(project.name)}
                      >
                        <Plus class="h-3 w-3 mr-1" />
                        New Session
                      </Button>
                    </Sidebar.MenuSubItem>
                  </Sidebar.MenuSub>
                </Collapsible.Content>
              </Sidebar.MenuItem>
            </Collapsible.Root>
          {/each}
        </Sidebar.Menu>
      </Sidebar.GroupContent>
    </Sidebar.Group>
  </Sidebar.Content>

  <Sidebar.Footer class="p-2">
    <div class="flex items-center justify-end">
      <!-- ThemeToggle is in the layout header, not sidebar footer -->
    </div>
  </Sidebar.Footer>
</Sidebar.Root>
```

- [ ] **Step 2: Update +layout.svelte to include sidebar**

In `packages/ui/src/routes/+layout.svelte`, add the sidebar:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { ModeWatcher } from 'mode-watcher';
  import { Toaster } from '$lib/components/ui/sonner';
  import { SidebarProvider, SidebarInset, SidebarTrigger } from '$lib/components/ui/sidebar';
  import AppSidebar from '$lib/components/AppSidebar.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import { connect } from '$lib/stores/connection';
  import '../app.css';

  let { children } = $props();
  let isTauri = $state(false);

  onMount(() => {
    isTauri = '__TAURI__' in window;
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    connect(`${wsProto}://${location.host}/ws`);
  });
</script>

<ModeWatcher />
<Toaster />

<div class="flex flex-col h-screen">
  {#if isTauri}
    <div class="h-8 bg-sidebar flex items-center px-3 text-xs text-sidebar-foreground" data-tauri-drag-region>
      <span class="font-semibold">cc2im</span>
    </div>
  {/if}

  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-10 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger class="-ml-1" />
        <div class="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main class="flex-1 flex flex-col overflow-hidden">
        {@render children()}
      </main>
      <StatusBar />
    </SidebarInset>
  </SidebarProvider>
</div>
```

- [ ] **Step 3: Delete old Sidebar.svelte**

```bash
rm packages/ui/src/lib/Sidebar.svelte
```

- [ ] **Step 4: Verify sidebar renders**

```bash
cd packages/ui && npm run dev
```

Expected: Sidebar appears with nav items (Chat, Stats, Config) and project list. Clicking items navigates.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/components/AppSidebar.svelte packages/ui/src/routes/+layout.svelte
git rm packages/ui/src/lib/Sidebar.svelte
git commit -m "feat(ui): rebuild sidebar with shadcn-svelte Sidebar components"
```

---

## Task 6: Chat Route Pages

Create the chat route pages: empty state, project view, and session view with ChatInput and MessageBubble.

**Files:**
- Create: `packages/ui/src/routes/chat/+page.svelte`
- Create: `packages/ui/src/routes/chat/[project]/+page.svelte`
- Create: `packages/ui/src/routes/chat/[project]/[session]/+page.svelte`
- Modify: `packages/ui/src/lib/ChatInput.svelte`
- Modify: `packages/ui/src/lib/MessageBubble.svelte`
- Delete: `packages/ui/src/lib/Chat.svelte`

- [ ] **Step 1: Create /chat empty state page**

Create `packages/ui/src/routes/chat/+page.svelte`:

```svelte
<script lang="ts">
  import { Card } from '$lib/components/ui/card';
  import MessageSquare from 'lucide-svelte/icons/message-square';
</script>

<div class="flex-1 flex items-center justify-center p-8">
  <Card.Root class="p-8 text-center max-w-md">
    <MessageSquare class="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
    <Card.Title class="text-lg mb-2">Select a session</Card.Title>
    <Card.Description>
      Choose a project and session from the sidebar to start chatting.
    </Card.Description>
  </Card.Root>
</div>
```

- [ ] **Step 2: Create /chat/[project] page**

Create `packages/ui/src/routes/chat/[project]/+page.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { Card } from '$lib/components/ui/card';
  import FolderOpen from 'lucide-svelte/icons/folder-open';

  let project = $derived($page.params.project);
</script>

<div class="flex-1 flex items-center justify-center p-8">
  <Card.Root class="p-8 text-center max-w-md">
    <FolderOpen class="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
    <Card.Title class="text-lg mb-2">Project: {project}</Card.Title>
    <Card.Description>
      Select a session from the sidebar or create a new one.
    </Card.Description>
  </Card.Root>
</div>
```

- [ ] **Step 3: Rewrite ChatInput.svelte with shadcn**

Rewrite `packages/ui/src/lib/ChatInput.svelte` replacing custom HTML with shadcn components:

- Replace `<textarea>` with shadcn `Textarea`
- Replace custom buttons with shadcn `Button`
- Replace custom image thumbnails with Tailwind-styled containers
- Keep all existing logic: auto-resize, drag-drop, paste, Enter/Shift+Enter, abort

Key changes:
```svelte
<script lang="ts">
  // Keep all existing logic
  import { Textarea } from '$lib/components/ui/textarea';
  import { Button } from '$lib/components/ui/button';
  import Send from 'lucide-svelte/icons/send';
  import Square from 'lucide-svelte/icons/square';
  import X from 'lucide-svelte/icons/x';
  // ... existing props and state
</script>
```

Replace the `<style>` block entirely — use only Tailwind classes in the template.

- [ ] **Step 4: Rewrite MessageBubble.svelte with shadcn**

Rewrite `packages/ui/src/lib/MessageBubble.svelte`:

- Wrap messages in shadcn `Card`
- Token info uses shadcn `Badge`
- Keep markdown rendering and highlight.js logic
- Remove scoped `<style>` — use Tailwind classes

```svelte
<script lang="ts">
  import { Card } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { marked } from 'marked';
  import hljs from 'highlight.js';
  // ... existing props
</script>
```

- [ ] **Step 5: Create /chat/[project]/[session] page**

Create `packages/ui/src/routes/chat/[project]/[session]/+page.svelte`:

Port the core logic from `Chat.svelte` — message list, auto-scroll, token display, send/abort:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { Badge } from '$lib/components/ui/badge';
  import MessageBubble from '$lib/MessageBubble.svelte';
  import ChatInput from '$lib/ChatInput.svelte';
  import { sessions, sendMessage, loadSession } from '$lib/stores/chat';

  let project = $derived($page.params.project);
  let sessionId = $derived($page.params.session);
  // Session map key matches store convention: sessionId directly, or "new-{project}" for new sessions
  let session = $derived($sessions.get(sessionId));
  let messages = $derived(session?.messages ?? []);
  let isStreaming = $derived(session?.messages?.at(-1)?.streaming ?? false);

  let messagesEnd: HTMLDivElement;

  onMount(async () => {
    // Validate project exists
    try {
      const projRes = await fetch('/api/projects');
      const projects = await projRes.json();
      if (!projects.some((p: any) => p.name === project)) {
        toast.error(`Project "${project}" not found`);
        goto('/chat', { replaceState: true });
        return;
      }
    } catch {
      // Continue — validation is best-effort
    }

    try {
      // loadSession(baseUrl, threadId, project) — baseUrl is empty string for same-origin
      await loadSession('', sessionId, project);
    } catch (e) {
      toast.error('Failed to load session');
      goto('/chat', { replaceState: true });
    }
  });

  $effect(() => {
    // Auto-scroll on new messages
    if (messages.length && messagesEnd) {
      messagesEnd.scrollIntoView({ behavior: 'smooth' });
    }
  });

  function handleSend(text: string) {
    // sendMessage(project, message, sessionId?) — actual signature
    sendMessage(project, text, sessionId);
  }

  function handleAbort() {
    // Abort streaming — send abort signal via WebSocket
    // (existing logic from Chat.svelte)
  }
</script>

<div class="flex-1 flex flex-col overflow-hidden">
  <!-- Message list -->
  <ScrollArea class="flex-1 p-4">
    <div class="max-w-3xl mx-auto space-y-4">
      {#each messages as message}
        <MessageBubble {message} />
      {/each}
      <div bind:this={messagesEnd}></div>
    </div>
  </ScrollArea>

  <!-- Token info + input -->
  <div class="border-t border-border">
    {#if session?.tokenInfo}
      <div class="flex gap-2 px-4 py-1">
        <Badge variant="secondary" class="text-xs">
          In: {session.tokenInfo.input}
        </Badge>
        <Badge variant="secondary" class="text-xs">
          Out: {session.tokenInfo.output}
        </Badge>
      </div>
    {/if}
    <ChatInput onSend={handleSend} onAbort={handleAbort} {isStreaming} />
  </div>
</div>
```

- [ ] **Step 6: Delete old Chat.svelte**

```bash
rm packages/ui/src/lib/Chat.svelte
```

- [ ] **Step 7: Verify chat flow**

```bash
cd packages/ui && npm run dev
```

Expected: Navigate to `/chat/project/session` — messages load, can send messages, auto-scrolls.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/routes/chat/ packages/ui/src/lib/ChatInput.svelte packages/ui/src/lib/MessageBubble.svelte
git rm packages/ui/src/lib/Chat.svelte
git commit -m "feat(ui): rebuild chat pages with shadcn-svelte and route-based navigation"
```

---

## Task 7: Stats Page

Rebuild Stats page as a route using shadcn Tabs, Card, Accordion, Table, Badge.

**Files:**
- Create: `packages/ui/src/routes/stats/+page.svelte`
- Delete: `packages/ui/src/lib/Stats.svelte`

- [ ] **Step 1: Create /stats/+page.svelte**

Port all logic from `Stats.svelte` (392 lines) into a route page using shadcn components:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import * as Tabs from '$lib/components/ui/tabs';
  import * as Card from '$lib/components/ui/card';
  import * as Accordion from '$lib/components/ui/accordion';
  import * as Table from '$lib/components/ui/table';
  import { Badge } from '$lib/components/ui/badge';

  // Port all existing state and logic from Stats.svelte:
  // - timeWindow, overview data, loading state
  // - fetchOverview(), fmt(), fmtFull(), fmtTime()
  // - Platform icons mapping

  // Key component replacements:
  // - .window-tabs → Tabs.Root + Tabs.List + Tabs.Trigger
  // - .summary-cards → Card.Root grid
  // - .project-card → Accordion.Item
  // - .session-table → Table.Root + Table.Header + Table.Body + Table.Row + Table.Cell
  // - platform badges → Badge with colored variants
</script>
```

Map existing CSS classes to shadcn:
- `.window-tabs .tab` → `<Tabs.Trigger value="24h">最近 24h</Tabs.Trigger>`
- `.summary-cards` → `<div class="grid grid-cols-3 gap-4">`
- `.project-card` → `<Accordion.Item>`
- `.session-table` → `<Table.Root>`

- [ ] **Step 2: Delete old Stats.svelte**

```bash
rm packages/ui/src/lib/Stats.svelte
```

- [ ] **Step 3: Verify stats page**

```bash
cd packages/ui && npm run dev
```

Navigate to `/stats`. Expected: Time window tabs, summary cards, project accordion, session table — all with shadcn styling.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/routes/stats/
git rm packages/ui/src/lib/Stats.svelte
git commit -m "feat(ui): rebuild stats page with shadcn Tabs/Card/Accordion/Table"
```

---

## Task 8: Config Page

Rebuild Config page as a route using shadcn form components.

**Files:**
- Create: `packages/ui/src/routes/config/+page.svelte`
- Delete: `packages/ui/src/lib/Config.svelte`

- [ ] **Step 1: Create /config/+page.svelte**

Port all logic from `Config.svelte` (639 lines) using shadcn components:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import * as Card from '$lib/components/ui/card';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Button } from '$lib/components/ui/button';
  import { Switch } from '$lib/components/ui/switch';
  import { Separator } from '$lib/components/ui/separator';

  // Port all existing state and logic from Config.svelte:
  // - config object, loading/saving state
  // - loadConfig(), saveConfig()
  // - addProject(), removeProject()
  // - Toast notifications → use svelte-sonner toast() instead of custom

  // Key replacements:
  // - Custom toast → toast.success('Saved') / toast.error('Failed')
  // - form sections → Card.Root with Card.Header + Card.Content
  // - <input> → <Input>
  // - checkboxes → <Switch>
  // - <button> → <Button>
</script>
```

- [ ] **Step 2: Delete old Config.svelte**

```bash
rm packages/ui/src/lib/Config.svelte
```

- [ ] **Step 3: Verify config page**

```bash
cd packages/ui && npm run dev
```

Navigate to `/config`. Expected: All config fields render, save works, toast notifications show.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/routes/config/
git rm packages/ui/src/lib/Config.svelte
git commit -m "feat(ui): rebuild config page with shadcn form components"
```

---

## Task 9: Onboarding Modal

Rewrite Onboarding as a shadcn Dialog, triggered from layout.

**Files:**
- Modify: `packages/ui/src/lib/Onboarding.svelte`
- Modify: `packages/ui/src/routes/+layout.svelte`

- [ ] **Step 1: Rewrite Onboarding.svelte with shadcn Dialog**

Rewrite `packages/ui/src/lib/Onboarding.svelte` using shadcn components:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Badge } from '$lib/components/ui/badge';

  // Port all 5-step logic from existing Onboarding.svelte:
  // - Claude detection, verify, first project, platforms, summary
  // - Step validation and navigation
  // - API calls to /api/claude/test, /api/config, /api/projects

  let { open = $bindable(false) } = $props();

  // On complete:
  function handleComplete() {
    open = false;
    goto('/chat');
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Welcome to cc2im</Dialog.Title>
      <Dialog.Description>Step {currentStep} of 5</Dialog.Description>
    </Dialog.Header>

    <!-- Step content ported from existing component -->
    <!-- ... -->

    <Dialog.Footer>
      <Button variant="outline" onclick={prevStep} disabled={currentStep === 1}>
        Back
      </Button>
      <Button onclick={nextStep}>
        {currentStep === 5 ? 'Finish' : 'Next'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

- [ ] **Step 2: Add onboarding check to +layout.svelte**

In `packages/ui/src/routes/+layout.svelte`, add onboarding state:

```svelte
<script lang="ts">
  // ... existing imports
  import Onboarding from '$lib/Onboarding.svelte';

  let showOnboarding = $state(false);

  onMount(async () => {
    // ... existing WebSocket connect

    // Check if onboarding is needed
    try {
      const res = await fetch('/api/projects');
      const projects = await res.json();
      if (!projects || projects.length === 0) {
        showOnboarding = true;
      }
    } catch {
      showOnboarding = true;
    }
  });
</script>

<!-- Add before closing div -->
<Onboarding bind:open={showOnboarding} />
```

- [ ] **Step 3: Verify onboarding flow**

```bash
cd packages/ui && npm run dev
```

Expected: If no projects exist, onboarding dialog shows. Complete the wizard → redirected to /chat.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/lib/Onboarding.svelte packages/ui/src/routes/+layout.svelte
git commit -m "feat(ui): rewrite onboarding with shadcn Dialog"
```

---

## Task 10: Cleanup & Delete Old Files

Remove App.svelte and any remaining old code.

**Files:**
- Delete: `packages/ui/src/App.svelte`

- [ ] **Step 1: Delete App.svelte**

```bash
rm packages/ui/src/App.svelte
```

- [ ] **Step 2: Search for any remaining imports of deleted files**

```bash
cd packages/ui && grep -r "App.svelte\|lib/Chat.svelte\|lib/Sidebar.svelte\|lib/Stats.svelte\|lib/Config.svelte\|currentProject\|currentSessionId" src/ --include="*.ts" --include="*.svelte"
```

Expected: No matches (all references removed).

- [ ] **Step 3: Verify full build**

```bash
cd packages/ui && npm run build
```

Expected: Build succeeds, output in `dist/`.

- [ ] **Step 4: Verify the built app works with the server**

```bash
cd /home/hills/projects/cc2im && npm run build && cc2im restart
```

Open the web UI. Test:
- `/chat` — empty state
- Navigate via sidebar to a project/session
- `/stats` — token stats display
- `/config` — settings load and save
- Theme toggle — light/dark/system
- Browser refresh — stays on current page
- Status bar — shows connection state

- [ ] **Step 5: Commit**

```bash
git rm packages/ui/src/App.svelte
git add packages/ui/
git commit -m "chore(ui): remove legacy components, verify production build"
```

---

## Task 11: Update Unit Tests

Update chat.test.ts for store changes and verify connection.test.ts still passes.

**Files:**
- Modify: `packages/ui/tests/chat.test.ts`

**Note:** Most chat.test.ts changes were done in Task 4. This task handles any remaining issues found during build.

- [ ] **Step 1: Run unit tests**

```bash
cd packages/ui && npm run test
```

- [ ] **Step 2: Fix any remaining test failures**

If any tests fail due to import path changes (SvelteKit uses `$lib/` alias), update test imports accordingly.

- [ ] **Step 3: Verify all tests pass**

```bash
cd packages/ui && npm run test
```

Expected: All tests PASS.

- [ ] **Step 4: Commit if changes were needed**

```bash
git add packages/ui/tests/
git commit -m "test(ui): update unit tests for SvelteKit migration"
```

---

## Task 12: Update E2E Tests

All E2E tests need URL-based navigation instead of click-based page switching.

**Files:**
- Modify: `test/e2e/*.spec.ts` (all affected spec files)

**Note:** Use @hills-test and @hills-e2e-test skills for this task.

- [ ] **Step 1: Invoke hills-test for E2E test plan**

Use the `hills-test` skill to analyze which E2E tests need changes and generate a test plan with skill assignments.

- [ ] **Step 2: Update navigation patterns in all E2E tests**

Replace page-state-based navigation with URL navigation:

```typescript
// Before (click-based):
await page.click('.nav-btn:has-text("Stats")');

// After (URL-based):
await page.goto('/stats');
```

```typescript
// Before (click-based session selection):
await page.click('.session-item:has-text("session-1")');

// After (URL-based):
await page.goto('/chat/project-1/session-1');
```

- [ ] **Step 3: Update CSS selectors for shadcn components**

shadcn components use different CSS class patterns. Update selectors:

```typescript
// Before:
await page.locator('.window-tabs .tab:has-text("24h")').click();

// After (shadcn Tabs):
await page.locator('[role="tab"]:has-text("24h")').click();
```

- [ ] **Step 4: Run E2E tests**

Use `hills-test-run` skill to execute and verify.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/
git commit -m "test(e2e): update all E2E tests for SvelteKit routing and shadcn selectors"
```

---

## Task 13: Final Verification

Run full verification before marking complete.

- [ ] **Step 1: Run unit tests**

```bash
cd packages/ui && npm run test
```

Expected: All PASS.

- [ ] **Step 2: Run production build**

```bash
cd packages/ui && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Run E2E tests**

Use `hills-test-run` skill.

Expected: All PASS.

- [ ] **Step 4: Run hills-test-quality**

Use `hills-test-quality` skill to review test quality.

- [ ] **Step 5: Run hills-test-verify**

Use `hills-test-verify` skill for visual verification with Playwright screenshots.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(ui): complete shadcn-svelte migration with SvelteKit routing and dual theme"
```
