# Web UI shadcn-svelte Migration Design

## Summary

Migrate the `packages/ui` web frontend from vanilla Svelte 5 + Vite with custom CSS to **SvelteKit + shadcn-svelte + Tailwind CSS**. This is a pure UI refactor — all existing functionality (chat, stats, config, onboarding) remains unchanged.

## Goals

- Replace all 8 custom components with shadcn-svelte equivalents
- Adopt Tailwind CSS + shadcn theme system (New York style, Zinc base, Cyan accent)
- Support light/dark/system theme switching
- Introduce SvelteKit file-based routing with deep URL state (`/chat/:project/:session`)
- Browser refresh preserves current page and state

## Non-Goals

- No new features or functionality changes
- No backend API changes (except SPA fallback routing)
- No SSR — stays as client-side rendered SPA

---

## 1. Architecture: vanilla Svelte → SvelteKit

### Current

- Vanilla Svelte 5 + Vite 6
- Single `App.svelte` with manual page state switching
- Client-side mounting via `mount()` in `main.ts`

### Target

- SvelteKit with `adapter-static` + `ssr: false`
- File-based routing under `src/routes/`
- `fallback: 'index.html'` for SPA behavior
- Remove `main.ts` (SvelteKit handles app mounting) and root `index.html` (replaced by `src/app.html`)

### Project Structure

```
packages/ui/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte            # Global layout: Sidebar + theme toggle + status bar + onboarding
│   │   ├── +page.svelte              # / → redirect to /chat
│   │   ├── chat/
│   │   │   ├── +page.svelte          # /chat (empty state)
│   │   │   └── [project]/
│   │   │       ├── +page.svelte      # /chat/:project (session list)
│   │   │       └── [session]/
│   │   │           └── +page.svelte  # /chat/:project/:session
│   │   ├── stats/
│   │   │   └── +page.svelte          # /stats
│   │   └── config/
│   │       └── +page.svelte          # /config
│   ├── lib/
│   │   ├── components/
│   │   │   └── ui/                   # shadcn-svelte generated components
│   │   ├── ChatInput.svelte          # Business components
│   │   ├── MessageBubble.svelte
│   │   ├── Onboarding.svelte
│   │   └── stores/
│   │       ├── chat.ts               # Modified: remove currentProject/currentSessionId stores
│   │       └── connection.ts         # Unchanged
│   ├── app.css                       # Tailwind directives + shadcn theme vars
│   └── app.html
├── svelte.config.js                  # SvelteKit + adapter-static
├── tailwind.config.ts
├── postcss.config.cjs                # CommonJS (project uses "type": "module")
└── vite.config.ts
```

---

## 2. Component Mapping

### Sidebar.svelte → `+layout.svelte` (Sidebar region)

| Current Element | → shadcn Component |
|---|---|
| Nav buttons (Chat/Stats/Config) | `Sidebar` + `SidebarMenu` |
| Project tree (collapsible) | `Collapsible` |
| Session list | `SidebarMenuSub` |
| New session button | `Button` |

### Chat.svelte → `/chat/[project]/[session]/+page.svelte`

| Current Element | → shadcn Component |
|---|---|
| Message list container | `ScrollArea` |
| Empty state hint | `Card` |
| Session token info | `Badge` |

### ChatInput.svelte

| Current Element | → shadcn Component |
|---|---|
| Input field | `Textarea` |
| Send/Abort buttons | `Button` |
| Image preview | Custom (with `Avatar` style) |

### MessageBubble.svelte

| Current Element | → shadcn Component |
|---|---|
| Message bubble | `Card` |
| Token info | `Badge` |
| Code block | highlight.js retained, wrapped in `Card` |

### Stats.svelte → `/stats/+page.svelte`

| Current Element | → shadcn Component |
|---|---|
| Time window toggle (24h/7d/all) | `Tabs` |
| Summary cards | `Card` |
| Collapsible project groups | `Collapsible` or `Accordion` |
| Session table | `Table` |
| Platform icons | `Badge` (colored variants) |

### Config.svelte → `/config/+page.svelte`

| Current Element | → shadcn Component |
|---|---|
| Form fields | `Input` / `Label` / `Switch` |
| Project management | `Card` + `Button` |
| Save button | `Button` |

### Onboarding.svelte (modal overlay in layout)

| Current Element | → shadcn Component |
|---|---|
| Modal dialog | `Dialog` |
| Form fields | `Input` / `Label` / `Button` |

### Global — `+layout.svelte`

| Feature | → shadcn Component |
|---|---|
| Theme toggle | `DropdownMenu` + `Button` (sun/moon icon) |
| Connection status bar | `Badge` (bottom bar, shows WebSocket state) |
| Tauri titlebar | Custom (retained, detect `__TAURI__` in layout) |
| Onboarding modal | `Dialog` (check onboarding state on layout mount) |
| Toast notifications | `Sonner` (invalid routes, errors) |

---

## 3. Theme System

### Style: New York + Zinc + Cyan Accent

- **Base style**: New York (compact, sharp corners)
- **Neutral palette**: Zinc (cool gray)
- **Primary accent**: Cyan (`#4cc9f0` / HSL 193 86% 63%)

### Theme Variables in `app.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 4%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 4%;
    --primary: 193 86% 63%;
    --primary-foreground: 0 0% 100%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --border: 240 6% 90%;
    --sidebar-background: 0 0% 98%;
    --sidebar-foreground: 240 5% 26%;
    /* ... other shadcn standard variables */
  }

  .dark {
    --background: 240 33% 14%;
    --foreground: 0 0% 88%;
    --card: 215 43% 16%;
    --card-foreground: 0 0% 88%;
    --primary: 193 86% 63%;
    --primary-foreground: 240 33% 14%;
    --muted: 240 20% 20%;
    --muted-foreground: 240 5% 65%;
    --border: 240 20% 26%;
    --sidebar-background: 215 43% 16%;
    --sidebar-foreground: 0 0% 88%;
    /* ... */
  }
}
```

### Theme Switching

- Library: `mode-watcher` (shadcn-svelte recommended)
- Modes: light / dark / system
- Persistence: localStorage
- Code highlighting: `github` theme (light) / current dark theme (dark), toggled dynamically

---

## 4. Data Flow & State Management

### Store Changes

- `stores/connection.ts` — **unchanged**, WebSocket connection with auto-reconnect
- `stores/chat.ts` — **modified**:
  - **Remove** `currentProject` and `currentSessionId` writable stores (replaced by route params)
  - **Keep** sessions Map, message streaming, `sendMessage()`, `loadSession()` unchanged
  - `sendMessage()` receives project/session as function parameters instead of reading from stores

### Route-Driven State

```
/chat                          → empty state
/chat/[project]                → show project's session list
/chat/[project]/[session]      → load and display session messages
```

- `$page.params.project` and `$page.params.session` are the single source of truth for current project/session
- Sidebar navigation: `goto('/chat/proj/sess')` instead of store assignment
- Page refresh: state recovered from URL params → `loadSession()`
- Invalid project/session URL: redirect to `/chat` with toast notification (via `svelte-sonner`)

### Onboarding Lifecycle

- `+layout.svelte` calls `checkOnboarding()` on mount
- If onboarding needed: show `Dialog` modal (Onboarding.svelte)
- On completion: `goto('/chat')` replaces previous `page = 'chat'` assignment

### WebSocket Lifecycle

- Connection initialized in `+layout.svelte` `onMount`
- Connection status displayed in layout bottom status bar (`Badge`)
- Existing reconnect logic (exponential backoff) unchanged

---

## 5. Build & Deployment

### Build Configuration

| Setting | Value |
|---|---|
| Adapter | `@sveltejs/adapter-static` |
| Adapter config | `adapter({ pages: 'dist', assets: 'dist', fallback: 'index.html' })` |
| SSR | `false` |
| Prerender | `false` |
| Output directory | `dist/` (unchanged, explicitly configured in adapter) |

### Backend Impact

- Backend already has SPA fallback (server.ts falls back to `index.html` for non-file paths)
- No backend changes expected — verify with production build

### Development Commands

| Command | Before | After |
|---|---|---|
| Dev server | `vite` | `vite dev` (SvelteKit) |
| Build | `vite build` | `vite build` (SvelteKit) |
| Test | `vitest` | `vitest` (unchanged) |

---

## 6. New Dependencies

### Add

| Package | Purpose |
|---|---|
| `@sveltejs/kit` | SvelteKit framework |
| `@sveltejs/adapter-static` | Static site generation |
| `tailwindcss` | Utility CSS framework |
| `postcss` | CSS processing |
| `autoprefixer` | Vendor prefixes |
| `tailwind-merge` | Tailwind class merging (shadcn dep) |
| `clsx` | Conditional class names (shadcn dep) |
| `bits-ui` | Headless UI primitives (shadcn dep) |
| `tailwindcss-animate` | Animation utilities (required by shadcn Dialog, Collapsible, etc.) |
| `mode-watcher` | Theme switching |
| `lucide-svelte` | Icons (New York style uses Lucide) |
| `svelte-sonner` | Toast notifications (shadcn recommended) |
| `shadcn-svelte` (CLI) | Dev tool for scaffolding/adding shadcn components |

### Remove

| Package | Reason |
|---|---|
| `@sveltejs/vite-plugin-svelte` | Replaced by SvelteKit's built-in Vite integration |

### Remove (files)

| File | Reason |
|---|---|
| `src/main.ts` | SvelteKit handles app mounting |
| `index.html` (root) | Replaced by `src/app.html` |
| `src/App.svelte` | Replaced by `src/routes/+layout.svelte` + route pages |
| `src/lib/Sidebar.svelte` | Rebuilt in `+layout.svelte` with shadcn Sidebar |
| `src/lib/Chat.svelte` | Rebuilt as `/chat/` route pages |
| `src/lib/Stats.svelte` | Rebuilt as `/stats/+page.svelte` |
| `src/lib/Config.svelte` | Rebuilt as `/config/+page.svelte` |
| `src/vite-env.d.ts` | Replaced by SvelteKit's auto-generated types |

### Keep

| Package | Reason |
|---|---|
| `svelte` | Core framework |
| `vite` | Build tool (used by SvelteKit) |
| `marked` | Markdown rendering |
| `highlight.js` | Code syntax highlighting |
| `vitest` | Unit testing |

---

## 7. Testing Strategy

### Unit Tests
- `connection.test.ts` — unchanged (store not modified)
- `chat.test.ts` — update needed: remove tests for `currentProject`/`currentSessionId` stores, update `sendMessage` tests to pass project/session as parameters

### E2E Tests (all specs affected)
- All existing E2E tests will break due to routing change (manual page state → URL-based navigation)
- Every test that navigates between pages needs to use `goto('/path')` or direct URL navigation instead of click-based page switching
- Affected areas: chat, sidebar, config, onboarding, stats
- New E2E tests needed for: deep link routing, browser refresh state preservation, invalid URL redirect

### Approach
- shadcn components are pre-tested by the library — focus testing on integration points
- Prioritize E2E test rewrite as a dedicated migration step

---

## 8. Migration Risk & Mitigation

| Risk | Mitigation |
|---|---|
| SvelteKit migration breaks existing functionality | Migrate architecture first, verify all pages render before restyling |
| shadcn components don't match current UX exactly | Accept minor visual differences; goal is shadcn consistency, not pixel-perfect match |
| WebSocket reconnection timing changes | Test connection lifecycle in layout vs previous App.svelte |
| highlight.js theme conflicts with Tailwind reset | Test code blocks early; may need Tailwind `@layer` ordering |
| Backend SPA fallback not configured | Document required backend change; test with production build |
