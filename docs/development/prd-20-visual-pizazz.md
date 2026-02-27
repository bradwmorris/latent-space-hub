# PRD-20: Visual Pizazz — ASCII art, brand accents, and terminal flair

**Status:** completed
**Completed:** 2026-02-27
**Type:** feature
**Priority:** medium
**Repo:** `latent-space-hub`

---

## Goal

Add personality and brand identity to the UI without losing the terminal aesthetic. The app should feel like a premium hacker tool built *for* Latent Space — not a generic dark-mode dashboard.

---

## Design Principles

- **Keep JetBrains Mono everywhere** — no font changes
- **Keep the dark terminal vibe** — no light mode, no gradients, no rounded cards
- **Add purple (#9333ea)** as a subtle brand accent — replaces some grays in key spots
- **ASCII art as identity** — the dashboard header should feel like booting into a system
- **Box-drawing characters** — use them for structure and flair, not decoration

---

## Changes

### 1. ASCII art dashboard header

Replace the plain `<h1>Dashboard</h1>` with an ASCII art "LATENT SPACE" header rendered in monospace. Something like:

```
██╗      █████╗ ████████╗███████╗███╗   ██╗████████╗
██║     ██╔══██╗╚══██╔══╝██╔════╝████╗  ██║╚══██╔══╝
██║     ███████║   ██║   █████╗  ██╔██╗ ██║   ██║
██║     ██╔══██║   ██║   ██╔══╝  ██║╚██╗██║   ██║
███████╗██║  ██║   ██║   ███████╗██║ ╚████║   ██║
╚══════╝╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═══╝   ╚═╝

███████╗██████╗  █████╗  ██████╗███████╗
██╔════╝██╔══██╗██╔══██╗██╔════╝██╔════╝
███████╗██████╔╝███████║██║     █████╗
╚════██║██╔═══╝ ██╔══██║██║     ██╔══╝
███████║██║     ██║  ██║╚██████╗███████╗
╚══════╝╚═╝     ╚═╝  ╚═╝ ╚═════╝╚══════╝
```

**Implementation:**
- New `AsciiHeader` component in `src/components/dashboard/`
- Rendered in very dark purple-tinted gray (`#4a2d6b` or similar) so it reads as texture, not a shout
- Subtle fade-in animation on mount
- Below it: a one-line system status in muted text — e.g., `3,891 nodes · 7,482 edges · system nominal`
- Replace the current `<h1>Dashboard</h1>` + aggregate totals line with this block

**Keep it small.** If the full block font is too loud, use a smaller ASCII style or just the word "HUB" in block letters with "LATENT SPACE" as a normal-weight label above it. Test a few sizes and pick what feels right.

### 2. Purple brand accent

Introduce `#9333ea` (Latent Space purple) as a secondary accent. Not everywhere — just in high-signal spots:

| Where | What changes |
|-------|-------------|
| **Active view tab** (MainViewSwitcher) | Active tab text or underline uses purple instead of white |
| **Selected type pill** (Dashboard) | Border or count number gets purple tint |
| **Left sidebar header** ("Latent Space") | Title text in purple |
| **Active category** (LeftTypePanel) | Expanded category header gets purple accent |
| **Node focus tab** (active) | Active tab indicator uses purple |
| **Links on hover** | Subtle purple instead of #aaa |

**Do NOT change:**
- Background colors (keep grayscale)
- Border colors (keep #1a1a1a / #262626)
- Body text colors (keep #e5e5e5 / #a3a3a3)
- Button backgrounds

Add CSS custom property: `--accent-brand: #9333ea` and a lighter variant `--accent-brand-light: #a855f7` for hover states.

### 3. Box-drawing section dividers

Replace plain `<hr>` or `border-bottom` dividers in the dashboard with box-drawing characters:

```
─────────────────────────────────
```

or the double-line variant:

```
═════════════════════════════════
```

Use these between the ASCII header and type grid, and between the type grid and category cards. Rendered as text in `#262626` (barely visible, structural).

### 4. Category card headers with flair

Current category card headers are plain text. Add a subtle box-drawing prefix:

```
┌─ Podcast ──────────── 128
├─ Latest: "Latent Space Ep. 142"
├─ "The AI Engineering Stack"
└─ "Scaling Laws Revisited"
```

This gives each card a tree/terminal feel. Keep the existing grid layout and card backgrounds.

### 5. Stat counters with tabular punch

The type breakdown pills currently show count + label. Add subtle visual weight:

- Count numbers: bump to `font-weight: 700` (from 600)
- On hover: count number briefly flashes purple before settling
- Add a subtle `border-left: 2px solid #9333ea` to the currently-selected type pill

### 6. Loading / empty states

- Loading state: replace any spinners with a pulsing `▓▒░` block character animation
- Empty category: show `── no items ──` in muted text instead of "No items yet"

---

## What NOT to do

- Don't add a second font (keep JetBrains Mono only)
- Don't add background gradients or glows
- Don't add color to body text
- Don't make the purple overwhelming — it should be 5-10% of the visual surface
- Don't change the layout structure (keep 3-panel, keep grids)
- Don't add images or SVG logos

---

## Tasks

- [x] Part 1: Create `AsciiHeader` component with "LATENT SPACE" ASCII art + system status line
- [x] Part 2: Add `--accent-brand` CSS custom properties and apply purple to active states (view tabs, sidebar header, selected type, active category, node tabs)
- [x] Part 3: Add box-drawing dividers on dashboard between sections
- [x] Part 4: Restyle category card previews with tree-drawing prefix characters
- [x] Part 5: Polish stat counters (weight, hover flash, selected border)
- [x] Part 6: Update loading/empty states with terminal-style characters
- [x] Part 7: Visual QA — build + type-check pass

---

## Done criteria

- Dashboard opens with ASCII "LATENT SPACE" header in muted purple-gray
- Purple accent visible on active tabs, sidebar header, selected states
- Box-drawing characters used as structural dividers
- Category cards use tree-drawing prefixes
- No layout changes, no font changes, no new dependencies
- `npm run build` + `npm run type-check` pass
