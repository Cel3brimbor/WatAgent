# Calendar map

A calendar workspace with a draggable map, searchable directory, persistent detail panel, and optional drag-and-drop tools. Common actions also have direct buttons and dropdowns. It knows nothing about calendars: the host passes plain data and callbacks, and every change goes back through those callbacks.

## Contract

- Imports only `react` and `@/shared/motion`. ESLint enforces this, and blocks the rest of `src` from importing anything but `index.ts`.
- Styles live in `calendar-map.module.css`. The token block at the top maps `--map-*` onto the host's tokens (`--ink`, `--paper`, `--accent`, …), with fallbacks so the map still reads well anywhere else.
- The layout is saved through a `LayoutStore`. `createLocalLayoutStore(key)` keeps it in `localStorage`. Pass your own store to save it somewhere else.

## Mounting

```tsx
import { CalendarMap, createLocalLayoutStore } from "@/features/calendar-map";

const layout = createLocalLayoutStore("my-app.map.v1");

<CalendarMap
  label="Calendar map"
  preferencesKey="my-app.map-view.v1" // optional local view settings
  groupLabels={{ left: "Your calendars", hub: "Agent", right: "Imports" }}
  nodes={nodes}         // MapNode[]: id, label, color, group ("hub" | "left" | "right"), badge, caption, dimmed, locked, busy, details, actions, toggle (an on/off button on the node), box (rows listed under the header, each with an optional dropdown and remove button; the node grows a row per item)
  edges={edges}         // MapEdge[]: from, to, label, weight, directed, dash, tone, faint, via (a pill on the line), details, actions, remove
  functions={functions} // MapFunction[]: "node" functions drop on one node; "link" functions connect two
  nodeDrop={drop}       // optional: what happens when one node is dragged onto another
  layoutStore={layout}
  toolbar={<YourControls />}
/>
```

`apply`, node and edge actions, and an edge's `remove` return a `MapChange` (`{ message, undo? }`). The map shows the message, announces it, and offers Undo (also ⌘/Ctrl+Z) when `undo` is present. Throwing an `Error` shows its message instead.

## Interaction

- Nodes follow the pointer 1:1 and stay where released. A cancelled drag restores the original position. Auto-arrange has Undo.
- The canvas fits its container by default; zoom controls allow closer inspection. Pointer coordinates account for the scale.
- Customize saves grid visibility, connection labels, connection scope, position lock, and zoom on this device when `preferencesKey` is supplied. Position lock blocks dragging and keyboard nudges.
- Select a node for direct actions, valid link targets, source configuration, and a list of connections. Search and the directory make off-screen nodes accessible.
- On narrow screens the inspector stacks below the map, and the canvas remains scrollable when zoomed.
- Functions can be dragged onto a node, or clicked (or pressed with Enter) to arm and then applied by choosing a node. Nodes that can't take a function show why.
- Drawable link functions also start from the handle on a node's edge.
- Arrow keys move the focused node; Shift moves it further. Esc cancels.
- A selected edge with `remove` shows a Delete link button. Delete or Backspace does the same.
- Respects `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`.

## Removing or lifting it out

- **Remove it from WatAgent:**
  - Delete this folder and `src/calendar/calendar-map-section.tsx`.
  - In `src/calendar/side-nav.tsx`, drop `"map"` from `AppSection`, its `BARS` entry and its icon.
  - In `src/calendar/calendar-app.tsx`, drop the `CalendarMapSection` import and render block, the `map` title, and the `attachRequest` state (only the map sets it).
  - `npm run typecheck` and `npm run lint` should pass. That was checked on a scratch branch.
- **Use it in another app:** copy this folder plus `src/shared/motion.ts`, and point the `@/shared/motion` import at the copy.

## Checks

```bash
npx tsx src/features/calendar-map/geometry.check.ts
npx tsx src/features/calendar-map/layout-store.check.ts
npx tsx src/features/calendar-map/view-preferences.check.ts
```

## Merge flows

The calendar host represents each saved merge as a compact `variant: "function"` node between imported source nodes and a regular output calendar. Source priority controls stay in the inspector. The saved `MergedCalendar` ids, names, and ordered members are unchanged, so existing data remains compatible. New flow layouts use the v2 position key; the previous device layout is retained under v1.

New calendar opens a Merge configuration dialog. The host's `configureMerge` adapter validates sources, preserves priority, and reconciles membership through the existing merge-board model. A source belongs to one merge at a time; the dialog identifies sources that will move from another output.

Connections use curved ports with obstacle-aware fallback routing. Transparent stroke hit targets support clicking anywhere along an arrow, and Enter/Space selects a focused connection.
