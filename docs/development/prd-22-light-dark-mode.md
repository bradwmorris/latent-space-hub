# PRD-22: Light/Dark Mode Toggle

**Status:** ready
**Type:** feature
**Priority:** medium
**Repo(s):** latent-space-hub

---

## Goal

Add a light/dark mode toggle so users can switch between themes. Currently the app is dark-only. Many users (especially non-technical ones we're trying to reach) prefer light mode, and it's table stakes for a polished desktop app.

---

## Current State

### What exists
- **CSS variables** in `app/globals.css` (lines 5-37) define the entire color palette as `:root` custom properties
- **39 component files** contain **330 hardcoded hex color values** (inline `style={}`) that duplicate the CSS variable values
- **`map-styles.css`** has its own hardcoded dark colors for React Flow nodes/edges
- **No theme context**, no `prefers-color-scheme` support, no toggle UI

### Color architecture
| Token | Dark value | Used for |
|-------|-----------|----------|
| `--bg-base` | `#0a0a0a` | Page background |
| `--bg-surface` | `#111111` | Panels |
| `--bg-elevated` | `#1a1a1a` | Cards, raised elements |
| `--bg-hover` | `#151515` | Hover states |
| `--text-primary` | `#e5e5e5` | Main text |
| `--text-secondary` | `#a3a3a3` | Captions, metadata |
| `--text-muted` | `#6b6b6b` | Disabled, helper text |
| `--border-subtle` | `#1a1a1a` | Dividers |
| `--border-default` | `#262626` | Component borders |
| `--accent-primary` | `#888` | Interactive elements |
| `--accent-brand` | `#9333ea` | Purple (brand) |

---

## Architecture

### Approach: CSS variables + data attribute

Toggle theme by setting `data-theme="light"` or `data-theme="dark"` on `<html>`. CSS variables swap values. No JS color logic needed in components.

```
User clicks toggle
  → ThemeProvider updates localStorage + <html> data-theme attribute
  → CSS variables swap via [data-theme="light"] selector
  → All components re-render with new colors automatically
```

### Why this approach
1. **CSS variables already exist** — just need a second set of values under a selector
2. **Minimal component changes** — only need to replace hardcoded hex values with `var(--token)` references
3. **No runtime cost** — CSS handles the swap, no React re-renders for color changes
4. **`prefers-color-scheme` support** comes free with a media query fallback

---

## Implementation

### Phase 1: Theme infrastructure (no visual change)

**1a. Add light theme variables to `globals.css`**

Keep `:root` as dark (default). Add light overrides:

```css
[data-theme="light"] {
  --bg-base: #ffffff;
  --bg-surface: #f5f5f5;
  --bg-elevated: #ebebeb;
  --bg-hover: #e8e8e8;
  --text-primary: #1a1a1a;
  --text-secondary: #525252;
  --text-muted: #a3a3a3;
  --border-subtle: #e5e5e5;
  --border-default: #d4d4d4;
  --accent-primary: #555;
  --accent-light: #444;
  --accent-dark: #777;
  --accent-subtle: rgba(85, 85, 85, 0.10);
  --accent-brand: #7c3aed;
  --accent-brand-light: #8b5cf6;
  --accent-brand-muted: #c4b5fd;
  --accent-brand-subtle: rgba(124, 58, 237, 0.08);
  --success: #16a34a;
  --error: #dc2626;
  --warning: #d97706;
}

/* System preference fallback */
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    /* same light values */
  }
}
```

Update hardcoded values in `html, body` to use variables:
```css
html, body {
  background-color: var(--bg-base);
  color: var(--text-primary);
}
```

Also update scrollbar and utility classes to use variables.

**1b. Create ThemeProvider**

New file: `src/components/theme/ThemeProvider.tsx`

```tsx
'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const ThemeContext = createContext<{
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}>({ theme: 'system', resolved: 'dark', setTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  // ... localStorage persistence, system preference detection,
  //     set data-theme on <html>
  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

**1c. Wrap app in ThemeProvider**

In `app/layout.tsx`, wrap `{children}` with `<ThemeProvider>`.

---

### Phase 2: Replace hardcoded colors in components

The big refactor. **39 files, ~330 occurrences.**

Replace inline hex values with CSS variable references:

| Hardcoded | Replace with |
|-----------|-------------|
| `'#0a0a0a'` | `'var(--bg-base)'` |
| `'#111111'` | `'var(--bg-surface)'` |
| `'#1a1a1a'` | `'var(--bg-elevated)'` |
| `'#151515'` | `'var(--bg-hover)'` |
| `'#e5e5e5'` | `'var(--text-primary)'` |
| `'#a3a3a3'` | `'var(--text-secondary)'` |
| `'#6b6b6b'` | `'var(--text-muted)'` |
| `'#262626'` | `'var(--border-default)'` |

Variations and one-off colors (e.g. `#161616`, `#2a2a2a`, `#3a3a3a`) should be mapped to the nearest token or get new tokens if the distinction matters.

**Priority order** (highest-impact files first):
1. `ThreePanelLayout.tsx` — main container
2. `LeftTypePanel.tsx`, `LeftToolbar.tsx` — sidebar
3. `MainViewSwitcher.tsx` — top nav
4. `FocusPanel.tsx` (59 occurrences) — node editor
5. `FolderViewOverlay.tsx` (70 occurrences) — folder view
6. All remaining files

---

### Phase 3: Update map-styles.css

Add `[data-theme="light"]` overrides for React Flow:

```css
[data-theme="light"] .rah-map-wrapper .react-flow__background {
  background: #f8f8f8 !important;
}

[data-theme="light"] .rah-map-node {
  background: #ffffff;
  border-color: #d4d4d4;
  color: #1a1a1a;
}

/* ... remaining overrides */
```

---

### Phase 4: Toggle UI

Add a toggle button. Two options (decide during implementation):

**Option A: Settings modal** — Add a "Theme" section to the existing `SettingsModal.tsx` with three choices: Light / Dark / System.

**Option B: Top bar icon** — Small sun/moon icon in `MainViewSwitcher.tsx` for quick toggling. Click cycles: dark → light → system.

Recommend **both** — icon for quick toggle, settings for explicit three-way choice.

---

## Files Changed

| File | Change |
|------|--------|
| `app/globals.css` | Add `[data-theme="light"]` variables, convert hardcoded `html,body` to vars |
| `app/layout.tsx` | Wrap with ThemeProvider |
| `src/components/theme/ThemeProvider.tsx` | **New** — theme context + persistence |
| `src/components/panes/map/map-styles.css` | Add light theme overrides |
| `src/components/layout/MainViewSwitcher.tsx` | Add toggle icon |
| `src/components/settings/SettingsModal.tsx` | Add theme selection |
| 39 component files | Replace hardcoded hex → `var(--token)` |

---

## Light Theme Palette

Designed to maintain the same monospace terminal aesthetic, just inverted. Not "bright white" — slightly warm/neutral.

| Token | Dark | Light |
|-------|------|-------|
| `--bg-base` | `#0a0a0a` | `#ffffff` |
| `--bg-surface` | `#111111` | `#f5f5f5` |
| `--bg-elevated` | `#1a1a1a` | `#ebebeb` |
| `--bg-hover` | `#151515` | `#e8e8e8` |
| `--text-primary` | `#e5e5e5` | `#1a1a1a` |
| `--text-secondary` | `#a3a3a3` | `#525252` |
| `--text-muted` | `#6b6b6b` | `#a3a3a3` |
| `--border-subtle` | `#1a1a1a` | `#e5e5e5` |
| `--border-default` | `#262626` | `#d4d4d4` |
| `--accent-primary` | `#888` | `#555` |
| `--accent-brand` | `#9333ea` | `#7c3aed` |
| `--scrollbar-thumb` | `#2a2a2a` | `#c4c4c4` |
| `--scrollbar-hover` | `#3a3a3a` | `#a3a3a3` |

Brand purple stays purple — just slightly adjusted for contrast on white.

---

## Edge Cases

- **Flash of wrong theme on load**: Use a blocking `<script>` in `<head>` to set `data-theme` before React hydrates (read from localStorage)
- **System preference changes**: Listen to `matchMedia('(prefers-color-scheme: dark)')` change events
- **Map canvas**: React Flow background pattern needs separate handling (SVG dots/lines)
- **Embedded content**: Markdown renderers, code blocks — ensure syntax highlighting adapts
- **Scrollbar colors**: Webkit scrollbar pseudo-elements need `[data-theme]` overrides

---

## Out of Scope

- Per-user persistence (server-side) — localStorage is sufficient
- Custom color themes beyond light/dark
- Bots repo (backend only, no UI)

---

## Execution Order

1. Phase 1 (infrastructure) — can be done without any visual change, ship as-is
2. Phase 2 (component refactor) — the bulk of the work, ~330 replacements across 39 files
3. Phase 3 (map styles) — isolated CSS file
4. Phase 4 (toggle UI) — flip the switch

Phases 2-4 should ship together. Phase 1 can land independently as a no-op refactor.
