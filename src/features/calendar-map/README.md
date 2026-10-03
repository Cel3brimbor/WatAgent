# Calendar map

A draggable map of nodes and the lines between them, with a palette of functions you drop onto nodes. It knows nothing about calendars: the host passes plain data and callbacks, and every change goes back through those callbacks.

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
  nodes={nodes}         // MapNode[]: id, label, color, group ("hub" | "left" | "right"), badge, caption, dimmed, locked, busy, details
  edges={edges}         // MapEdge[]: from, to, label, weight, directed, dash, tone, faint, via (a pill on the line), details, actions
  functions={functions} // MapFunction[]: "node" functions drop on one node; "link" functions connect two
  nodeDrop={drop}       // optional: what happens when one node is dragged onto another
  layoutStore={layout}
  toolbar={<YourControls />}
/>
```

`apply` and edge actions return a `MapChange` (`{ message, undo? }`). The map shows the message, announces it, and offers Undo (also ⌘/Ctrl+Z) when `undo` is present. Throwing an `Error` shows its message instead.

## Interaction

- Nodes follow the pointer 1:1, rubber-band at the canvas edge, and are thrown with momentum into springs on release. Grabbing a moving node stops it where it is.
- Functions can be dragged onto a node, or clicked (or pressed with Enter) to arm and then applied by choosing a node. Nodes that can't take a function show why.
- Drawable link functions also start from the handle on a node's edge.
- Arrow keys move the focused node; Shift moves it further. Esc cancels.
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
```
