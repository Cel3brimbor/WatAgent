"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { animateSpring, type SpringHandle } from "@/shared/motion";
import {
  boxesOverlap,
  canvasHeight,
  centreBounds,
  clamp,
  defaultLayout,
  edgeGeometry,
  exitPoint,
  MIN_CANVAS_WIDTH,
  NODE_SIZE,
  nodeSize,
  nodeAt,
  toPx,
  toUnit,
  type Box,
  type Pt,
} from "./geometry";
import type {
  LayoutStore,
  MapChange,
  MapEdge,
  MapFunction,
  MapLinkFunction,
  MapNode,
  MapNodeDrop,
  MapPoint,
} from "./types";
import { capturePointer } from "./pointer";
import { useFunctionDrag } from "./use-function-drag";
import { useNodeDrag } from "./use-node-drag";
import styles from "./calendar-map.module.css";

export type CalendarMapProps = {
  /** Accessible name for the whole map. */
  label: string;
  nodes: MapNode[];
  edges: MapEdge[];
  functions: MapFunction[];
  /** Dragging one node onto another. */
  nodeDrop?: MapNodeDrop;
  /** Where the arrangement is kept. Without one it lasts until the map unmounts. */
  layoutStore?: LayoutStore;
  /** Controls above the canvas. */
  toolbar?: ReactNode;
  /** Inspector text when nothing is selected. */
  hint?: string;
  /** Shown when there are no nodes. */
  empty?: ReactNode;
};

type Selection = { kind: "node" | "edge"; id: string } | null;
type Gesture =
  | { kind: "idle" }
  | { kind: "armed"; fnId: string }
  //fnId null means it was drawn from a node's handle, so any drawable link function may take it.
  //held: the pointer is still down on that handle.
  | { kind: "linking"; fnId: string | null; from: string; end: Pt | null; held: boolean };
type Ghost = { fnId: string; at: Pt; absorbing?: boolean };
type Toast = { key: number; message: string; change?: MapChange };
type Outcome = MapChange | void | Promise<MapChange | void>;

const MAGNET = 28;
//a node's toggle button, in px; matches .nodeToggle
const TOGGLE = 24;
const MAGNET_PULL = 0.35;
const TOAST_MS = 6000;
const UNDO_DEPTH = 10;
const NUDGE = 8;
const NUDGE_FAR = 32;
const FAILED = "That didn't work. Try again.";
const NO_LINK = "Those two can't be connected.";
const ARROWS: Record<string, Pt> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

function LockGlyph() {
  return (
    <svg className={styles.lock} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" strokeLinecap="round" />
    </svg>
  );
}

function spokenNode(node: MapNode): string {
  return [node.badge, node.label, node.caption].filter(Boolean).join(", ");
}

export function CalendarMap({ label, nodes, edges, functions, nodeDrop, layoutStore, toolbar, hint, empty }: CalendarMapProps) {
  const rootRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef(new Map<string, HTMLButtonElement>());
  const markerId = `map${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const [width, setWidth] = useState(0);
  const [layout, setLayout] = useState<Record<string, MapPoint>>({});
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [gesture, setGesture] = useState<Gesture>({ kind: "idle" });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ id: string; key: number } | null>(null);
  const [retract, setRetract] = useState<{ from: string; end: Pt } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const undoStack = useRef<MapChange[]>([]);
  const ghostRef = useRef<Ghost | null>(null);
  const handleDrag = useRef<{ pointerId: number; from: string } | null>(null);
  const retracting = useRef<{ handles: SpringHandle[] }>({ handles: [] });
  const tidying = useRef(0);
  //nodes gliding to a new default spot (say, after a rank change) rather than placed by hand
  const reflowing = useRef(new Set<string>());
  const lastDefaults = useRef<{ size: { width: number; height: number }; at: Record<string, Pt> } | null>(null);

  const sizeById = useMemo(() => new Map(nodes.map((node) => [node.id, nodeSize(node)])), [nodes]);
  const sizeOf = useCallback((id: string) => sizeById.get(id) ?? NODE_SIZE, [sizeById]);
  const height = useMemo(() => canvasHeight(nodes), [nodes]);
  const size = useMemo(() => ({ width, height }), [width, height]);
  const defaults = useMemo(() => defaultLayout(nodes, size), [nodes, size]);
  const centres = useMemo(() => {
    const out: Record<string, Pt> = {};
    for (const node of nodes) out[node.id] = toPx(layout[node.id] ?? defaults[node.id] ?? { x: 0.5, y: 0.5 }, size);
    return out;
  }, [nodes, layout, defaults, size]);
  const boxes = useMemo(
    () => nodes.map((node) => ({ id: node.id, ...centres[node.id], ...sizeOf(node.id) })),
    [nodes, centres, sizeOf],
  );
  const boxById = useMemo(() => new Map(boxes.map((box) => [box.id, box])), [boxes]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const fnById = useMemo(() => new Map(functions.map((fn) => [fn.id, fn])), [functions]);
  const drawables = useMemo(
    () => functions.filter((fn): fn is MapLinkFunction => fn.kind === "link" && Boolean(fn.drawable)),
    [functions],
  );
  const groups = useMemo(() => {
    const out = new Map<string, MapFunction[]>();
    for (const fn of functions) out.set(fn.group, [...(out.get(fn.group) ?? []), fn]);
    return [...out.entries()];
  }, [functions]);

  //narrow frames pan across a full-size canvas
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setWidth(Math.max(Math.round(frame.clientWidth), MIN_CANVAS_WIDTH));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  //once the canvas has its width, start with the hub in view
  const centred = useRef(false);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || centred.current || width === 0) return;
    centred.current = true;
    frame.scrollLeft = Math.max(0, (frame.scrollWidth - frame.clientWidth) / 2);
  }, [width]);

  useEffect(() => {
    setLayout(layoutStore?.load() ?? {});
    setLoaded(true);
  }, [layoutStore]);

  //saves once things stop moving
  useEffect(() => {
    if (!loaded || !layoutStore) return;
    const timer = window.setTimeout(() => layoutStore.save(layout), 400);
    return () => window.clearTimeout(timer);
  }, [layout, loaded, layoutStore]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.key === toast.key ? null : current)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const flight = retracting.current;
    return () => {
      for (const handle of flight.handles) handle.stop();
    };
  }, []);

  const announce = useCallback((message: string) => setAnnouncement(message), []);

  const tell = useCallback(
    (message: string, change?: MapChange) => {
      setToast({ key: Date.now(), message, change });
      announce(message);
    },
    [announce],
  );

  const run = useCallback(
    async (action: () => Outcome, pulseId?: string) => {
      let change: MapChange | void;
      try {
        change = await action();
      } catch (err) {
        tell(err instanceof Error && err.message ? err.message : FAILED);
        return;
      }
      if (pulseId) setPulse({ id: pulseId, key: Date.now() });
      if (!change) return;
      if (change.undo) undoStack.current = [...undoStack.current, change].slice(-UNDO_DEPTH);
      tell(change.message, change.undo ? change : undefined);
    },
    [tell],
  );

  const undo = useCallback(
    (change?: MapChange) => {
      const target = change ?? undoStack.current[undoStack.current.length - 1];
      //an entry already undone (from the toast or ⌘Z) can't be undone twice
      if (!target?.undo || !undoStack.current.includes(target)) return;
      undoStack.current = undoStack.current.filter((entry) => entry !== target);
      target.undo();
      tell(`Undone: ${target.message}`);
    },
    [tell],
  );

  function toCanvas(clientX: number, clientY: number): Pt {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: 0, y: 0 };
  }

  function toRoot(clientX: number, clientY: number): Pt {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left, y: clientY - rect.top } : { x: clientX, y: clientY };
  }

  function canvasToRoot(point: Pt): Pt {
    const canvas = canvasRef.current?.getBoundingClientRect();
    const root = rootRef.current?.getBoundingClientRect();
    if (!canvas || !root) return point;
    return { x: point.x + canvas.left - root.left, y: point.y + canvas.top - root.top };
  }

  function verdict(fn: MapFunction, nodeId: string, from?: string): true | string {
    if (fn.kind === "node") return fn.accepts(nodeId);
    return from ? fn.accepts(from, nodeId) : fn.acceptsFrom(nodeId);
  }

  function drawVerdict(from: string, to: string): true | string {
    let reason: string | null = null;
    for (const fn of drawables) {
      const answer = fn.accepts(from, to);
      if (answer === true) return true;
      reason ??= answer;
    }
    return reason ?? NO_LINK;
  }

  function canDrawFrom(id: string): boolean {
    return drawables.some((fn) => fn.acceptsFrom(id) === true);
  }

  function cancel(message = "Cancelled") {
    setGesture({ kind: "idle" });
    announce(message);
  }

  function promptFor(fn: MapFunction): string {
    return `${fn.label}: ${fn.prompt ?? "choose where to use it"}. Esc cancels.`;
  }

  //a node function runs straight away; a link function starts a line from this node
  function applyTo(fn: MapFunction, nodeId: string): boolean {
    const answer = verdict(fn, nodeId);
    if (answer !== true) {
      tell(answer);
      return false;
    }
    if (fn.kind === "node") {
      setGesture({ kind: "idle" });
      void run(() => fn.apply(nodeId), nodeId);
      return true;
    }
    setGesture({ kind: "linking", fnId: fn.id, from: nodeId, end: null, held: false });
    announce(`${fn.label}: choose what ${nodeById.get(nodeId)?.label ?? "it"} connects to. Esc cancels.`);
    return true;
  }

  function completeLink(fnId: string | null, from: string, to: string): boolean {
    const found = fnId ? fnById.get(fnId) : drawables.find((fn) => fn.accepts(from, to) === true);
    const fn = found?.kind === "link" ? found : undefined;
    const answer = fn ? fn.accepts(from, to) : drawVerdict(from, to);
    if (!fn || answer !== true) {
      tell(typeof answer === "string" ? answer : NO_LINK);
      return false;
    }
    setGesture({ kind: "idle" });
    void run(() => fn.apply(from, to), to);
    return true;
  }

  function activateNode(id: string) {
    if (gesture.kind === "armed") {
      const fn = fnById.get(gesture.fnId);
      if (fn) applyTo(fn, id);
      return;
    }
    if (gesture.kind === "linking") {
      if (id === gesture.from) cancel();
      else completeLink(gesture.fnId, gesture.from, id);
      return;
    }
    setSelection((current) => (current?.kind === "node" && current.id === id ? null : { kind: "node", id }));
  }

  function toggleArm(fnId: string) {
    if (gesture.kind === "armed" && gesture.fnId === fnId) {
      cancel();
      return;
    }
    const fn = fnById.get(fnId);
    if (!fn) return;
    setSelection(null);
    setGesture({ kind: "armed", fnId });
    announce(promptFor(fn));
  }

  function tidy() {
    setSelection(null);
    const moved = nodes.filter((node) => layout[node.id] && defaults[node.id]);
    if (moved.length === 0) {
      announce("The map is already tidy");
      return;
    }
    tidying.current = moved.length;
    for (const node of moved) nodeDrag.settle(node.id, toPx(defaults[node.id], size));
    announce("Map tidied");
  }

  const nodeDrag = useNodeDrag({
    toCanvas,
    centre: (id) => centres[id] ?? { x: width / 2, y: height / 2 },
    bounds: (id) => centreBounds(size, sizeOf(id)),
    span: () => size,
    move: (id, point) => setLayout((current) => ({ ...current, [id]: toUnit(point, size) })),
    onPress: setPressed,
    onTap: activateNode,
    over: (id, point) => {
      if (!nodeDrop) return null;
      const dragged: Box = { ...point, ...sizeOf(id) };
      for (const other of boxes) {
        if (other.id !== id && boxesOverlap(dragged, other) && nodeDrop.accepts(id, other.id) === true) return other.id;
      }
      return null;
    },
    onOver: setOver,
    drop: (id, target) => {
      if (!nodeDrop || nodeDrop.accepts(id, target) !== true) return false;
      void run(() => nodeDrop.apply(id, target), target);
      return true;
    },
    onSettled: (id) => {
      if (reflowing.current.delete(id)) {
        setLayout((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        return;
      }
      if (tidying.current === 0) return;
      tidying.current -= 1;
      if (tidying.current === 0) setLayout({});
    },
  });

  //when a node's default spot moves on the same canvas, it glides there instead of jumping.
  //a resize just reflows.
  useLayoutEffect(() => {
    const previous = lastDefaults.current;
    const at: Record<string, Pt> = {};
    for (const node of nodes) if (defaults[node.id]) at[node.id] = toPx(defaults[node.id], size);
    lastDefaults.current = { size, at };
    if (!previous || previous.size.width !== size.width || previous.size.height !== size.height || size.width === 0) return;
    for (const node of nodes) {
      const from = previous.at[node.id];
      const to = at[node.id];
      if (!from || !to || layout[node.id] || (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1)) continue;
      reflowing.current.add(node.id);
      setLayout((current) => ({ ...current, [node.id]: toUnit(from, size) }));
      nodeDrag.settleFrom(node.id, from, to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the defaults move; the rest is read fresh
  }, [defaults]);

  function placeGhost(fnId: string, at: Pt, absorbing = false) {
    const next = { fnId, at, absorbing };
    ghostRef.current = next;
    setGhost(next);
  }

  function clearGhost() {
    ghostRef.current = null;
    setGhost(null);
    setOver(null);
  }

  //the ghost shrinks into the node in the same frame the change lands
  function absorbGhost(target: string) {
    const current = ghostRef.current;
    if (!current) return;
    placeGhost(current.fnId, canvasToRoot(centres[target]), true);
    const absorbing = ghostRef.current;
    window.setTimeout(() => {
      if (ghostRef.current === absorbing) clearGhost();
    }, 200);
  }

  const fnDrag = useFunctionDrag({
    onTap: toggleArm,
    onStart: (fnId, clientX, clientY) => {
      setGesture({ kind: "idle" });
      setSelection(null);
      placeGhost(fnId, toRoot(clientX, clientY));
    },
    onMove: (fnId, clientX, clientY) => {
      const fn = fnById.get(fnId);
      const target = nodeAt(boxes, toCanvas(clientX, clientY), MAGNET);
      let at = toRoot(clientX, clientY);
      if (fn && target && verdict(fn, target) === true) {
        const centre = canvasToRoot(centres[target]);
        at = { x: at.x + (centre.x - at.x) * MAGNET_PULL, y: at.y + (centre.y - at.y) * MAGNET_PULL };
        setOver(target);
      } else {
        setOver(null);
      }
      placeGhost(fnId, at);
    },
    onEnd: (fnId, clientX, clientY, cancelled) => {
      setOver(null);
      const fn = fnById.get(fnId);
      const target = cancelled || !fn ? null : nodeAt(boxes, toCanvas(clientX, clientY), MAGNET);
      if (!fn || !target) return false;
      const answer = verdict(fn, target);
      if (answer !== true) {
        tell(answer);
        return false;
      }
      absorbGhost(target);
      applyTo(fn, target);
      return true;
    },
    ghostAt: () => ghostRef.current?.at ?? null,
    home: (fnId) => {
      const chip = chipRefs.current.get(fnId);
      const root = rootRef.current?.getBoundingClientRect();
      if (!chip || !root) return null;
      const rect = chip.getBoundingClientRect();
      return { x: rect.left + rect.width / 2 - root.left, y: rect.top + rect.height / 2 - root.top };
    },
    placeGhost: (fnId, at) => placeGhost(fnId, at),
    clearGhost,
  });

  function stopRetract() {
    for (const handle of retracting.current.handles) handle.stop();
    retracting.current.handles = [];
    setRetract(null);
  }

  //a line let go over nothing springs back into the node it came from
  function retractLine(from: string, end: Pt) {
    const home = centres[from];
    if (!home) return;
    const live = { ...end };
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending > 0) return;
      retracting.current.handles = [];
      setRetract(null);
    };
    const axis = (key: "x" | "y") =>
      animateSpring({
        from: end[key],
        to: home[key],
        response: 0.25,
        onUpdate: (value) => {
          live[key] = value;
          setRetract({ from, end: { ...live } });
        },
        onComplete: done,
      });
    const handles = [axis("x"), axis("y")];
    if (pending > 0) retracting.current.handles = handles;
  }

  function finishHandle(event: ReactPointerEvent<HTMLSpanElement>, cancelled: boolean) {
    const drag = handleDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.stopPropagation();
    handleDrag.current = null;
    const end = toCanvas(event.clientX, event.clientY);
    const target = cancelled ? null : nodeAt(boxes, end, 12, drag.from);
    if (target && completeLink(null, drag.from, target)) return;
    setGesture({ kind: "idle" });
    retractLine(drag.from, end);
  }

  function bindHandle(from: string) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        stopRetract();
        capturePointer(event.currentTarget, event.pointerId);
        handleDrag.current = { pointerId: event.pointerId, from };
        setSelection(null);
        setGesture({ kind: "linking", fnId: null, from, end: toCanvas(event.clientX, event.clientY), held: true });
      },
      onPointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
        const drag = handleDrag.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        const end = toCanvas(event.clientX, event.clientY);
        setGesture((current) => (current.kind === "linking" ? { ...current, end } : current));
      },
      onPointerUp(event: ReactPointerEvent<HTMLSpanElement>) {
        finishHandle(event, false);
      },
      onPointerCancel(event: ReactPointerEvent<HTMLSpanElement>) {
        finishHandle(event, true);
      },
    };
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (gesture.kind !== "idle") cancel();
    else setSelection(null);
  }

  function onCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (gesture.kind !== "linking" || gesture.held) return;
    const end = toCanvas(event.clientX, event.clientY);
    setGesture({ ...gesture, end });
  }

  function onNodeKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, id: string) {
    const direction = ARROWS[event.key];
    if (!direction) return;
    event.preventDefault();
    nodeDrag.stop(id);
    const step = event.shiftKey ? NUDGE_FAR : NUDGE;
    const bounds = centreBounds(size, sizeOf(id));
    const centre = centres[id];
    const next = {
      x: clamp(centre.x + direction.x * step, bounds.minX, bounds.maxX),
      y: clamp(centre.y + direction.y * step, bounds.minY, bounds.maxY),
    };
    setLayout((current) => ({ ...current, [id]: toUnit(next, size) }));
  }

  function removeEdge(edge: MapEdge) {
    if (!edge.remove) return;
    setSelection(null);
    void run(edge.remove.run, edge.from);
  }

  function onRootKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      if (gesture.kind !== "idle") {
        event.preventDefault();
        cancel();
      } else if (selection) {
        setSelection(null);
      }
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selection?.kind === "edge" && gesture.kind === "idle") {
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
      const edge = edges.find((entry) => entry.id === selection.id);
      if (!edge?.remove) return;
      event.preventDefault();
      removeEdge(edge);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
      if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
      if (undoStack.current.length === 0) return;
      event.preventDefault();
      undo();
    }
  }

  const ready = width > 0;
  const selectedNode = selection?.kind === "node" ? nodeById.get(selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? edges.find((edge) => edge.id === selection.id) : undefined;
  const activeFn = ghost ? fnById.get(ghost.fnId) : gesture.kind === "armed" ? fnById.get(gesture.fnId) : undefined;

  function acceptance(nodeId: string): true | string | null {
    if (gesture.kind === "linking") {
      if (nodeId === gesture.from) return null;
      if (!gesture.fnId) return drawVerdict(gesture.from, nodeId);
      const fn = fnById.get(gesture.fnId);
      return fn ? verdict(fn, nodeId, gesture.from) : null;
    }
    return activeFn ? verdict(activeFn, nodeId) : null;
  }

  const shapes = ready
    ? edges.flatMap((edge) => {
        const from = boxById.get(edge.from);
        const to = boxById.get(edge.to);
        const geo = from && to ? edgeGeometry(from, to, boxes, size) : null;
        return geo ? [{ edge, geo }] : [];
      })
    : [];

  //the line being drawn: from its node toward the pointer, snapping onto a node that would take it
  let liveLine: { start: Pt; end: Pt } | null = null;
  let linkOver: string | null = null;
  const lineSource = gesture.kind === "linking" && gesture.end ? { from: gesture.from, end: gesture.end } : retract;
  if (ready && lineSource) {
    const source = boxById.get(lineSource.from);
    if (source) {
      let end = lineSource.end;
      if (gesture.kind === "linking") {
        linkOver = nodeAt(boxes, end, 12, gesture.from);
        const target = linkOver ? boxById.get(linkOver) : undefined;
        if (target && acceptance(target.id) === true) end = exitPoint(target, source, 4);
      }
      liveLine = { start: exitPoint(source, end, 2), end };
    }
  }

  const status =
    gesture.kind === "armed"
      ? activeFn
        ? promptFor(activeFn)
        : null
      : gesture.kind === "linking"
        ? `Choose what ${nodeById.get(gesture.from)?.label ?? "it"} connects to. Esc cancels.`
        : null;

  const nodeLabel = (id: string) => nodeById.get(id)?.label ?? id;

  return (
    <section ref={rootRef} className={styles.map} aria-label={label} onKeyDown={onRootKeyDown}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarSlot}>{toolbar}</div>
        <button type="button" className={styles.button} onClick={tidy}>
          Tidy up
        </button>
      </div>

      <div className={styles.stage}>
        <div ref={frameRef} className={styles.frame}>
          <div
            ref={canvasRef}
            className={styles.canvas}
            style={{ width: width || undefined, height }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
          >
            {ready ? (
              <svg className={styles.edges} width={width} height={height} aria-hidden="true">
                <defs>
                  {(["neutral", "accent"] as const).map((tone) => (
                    <marker
                      key={tone}
                      id={`${markerId}-${tone}`}
                      viewBox="0 0 10 10"
                      refX="8.5"
                      refY="5"
                      markerWidth="9"
                      markerHeight="9"
                      markerUnits="userSpaceOnUse"
                      orient="auto-start-reverse"
                    >
                      <path d="M1 1.5 9 5 1 8.5z" className={tone === "accent" ? styles.arrowAccent : styles.arrowNeutral} />
                    </marker>
                  ))}
                </defs>
                {shapes.map(({ edge, geo }) => (
                  <path
                    key={edge.id}
                    className={styles.edge}
                    d={
                      geo.control
                        ? `M${geo.start.x} ${geo.start.y}Q${geo.control.x} ${geo.control.y} ${geo.end.x} ${geo.end.y}`
                        : `M${geo.start.x} ${geo.start.y}L${geo.end.x} ${geo.end.y}`
                    }
                    strokeWidth={1.25 + clamp(edge.weight ?? 0, 0, 1) * 1.75}
                    data-tone={edge.tone ?? "neutral"}
                    data-dash={edge.dash}
                    data-faint={edge.faint || undefined}
                    data-selected={(selection?.kind === "edge" && selection.id === edge.id) || undefined}
                    markerEnd={edge.directed ? `url(#${markerId}-${edge.tone === "accent" ? "accent" : "neutral"})` : undefined}
                  />
                ))}
                {liveLine ? (
                  <line
                    className={styles.liveLine}
                    x1={liveLine.start.x}
                    y1={liveLine.start.y}
                    x2={liveLine.end.x}
                    y2={liveLine.end.y}
                  />
                ) : null}
              </svg>
            ) : null}

            {shapes.map(({ edge, geo }) => {
              const selected = selection?.kind === "edge" && selection.id === edge.id;
              const pick = () => setSelection(selected ? null : { kind: "edge", id: edge.id });
              if (edge.via) {
                return (
                  <button
                    key={edge.id}
                    type="button"
                    className={styles.via}
                    style={{ transform: `translate(${geo.mid.x}px, ${geo.mid.y}px) translate(-50%, -50%)` }}
                    data-selected={selected || undefined}
                    aria-pressed={selected}
                    aria-label={`${edge.via.label}: ${nodeLabel(edge.from)} to ${nodeLabel(edge.to)}`}
                    onClick={pick}
                  >
                    {edge.via.label}
                  </button>
                );
              }
              if (!edge.label) return null;
              const spoken = `${nodeLabel(edge.from)} to ${nodeLabel(edge.to)}: ${edge.label}`;
              //a label wider than the gap it sits in shrinks to a dot; the inspector still has the words
              const roomy =
                geo.label.align !== "middle" || Math.hypot(geo.end.x - geo.start.x, geo.end.y - geo.start.y) >= edge.label.length * 6.4 + 28;
              if (!roomy) {
                return (
                  <button
                    key={edge.id}
                    type="button"
                    className={styles.edgeDot}
                    style={{ transform: `translate(${geo.mid.x}px, ${geo.mid.y}px) translate(-50%, -50%)` }}
                    data-tone={edge.tone ?? "neutral"}
                    data-selected={selected || undefined}
                    aria-pressed={selected}
                    aria-label={spoken}
                    title={edge.label}
                    onClick={pick}
                  />
                );
              }
              const shift = { start: "translate(0, -50%)", middle: "translate(-50%, -50%)", end: "translate(-100%, -50%)" }[geo.label.align];
              return (
                <button
                  key={edge.id}
                  type="button"
                  className={styles.edgeLabel}
                  style={{ transform: `translate(${geo.label.x}px, ${geo.label.y}px) ${shift}` }}
                  data-selected={selected || undefined}
                  aria-pressed={selected}
                  aria-label={spoken}
                  onClick={pick}
                >
                  {edge.label}
                </button>
              );
            })}

            {ready
              ? nodes.map((node) => {
                  const centre = centres[node.id];
                  const answer = acceptance(node.id);
                  const selected = selection?.kind === "node" && selection.id === node.id;
                  const highlighted = over === node.id || (linkOver === node.id && answer === true);
                  const { w: nodeW, h: nodeH } = sizeOf(node.id);
                  //the toggle sits in the header row, which is the whole node unless it's a box
                  const headerY = centre.y - nodeH / 2 + NODE_SIZE.h / 2;
                  return (
                    <Fragment key={node.id}>
                      <button
                        type="button"
                        className={styles.node}
                        style={
                          {
                            width: nodeW,
                            height: nodeH,
                            transform: `translate3d(${centre.x - nodeW / 2}px, ${centre.y - nodeH / 2}px, 0)`,
                            "--node-color": node.color,
                          } as CSSProperties
                        }
                        data-hub={node.group === "hub" || undefined}
                        data-selected={selected || undefined}
                        data-pressed={pressed === node.id || undefined}
                        data-dimmed={node.dimmed || undefined}
                        data-toggle={node.toggle ? true : undefined}
                      data-box={node.box ? true : undefined}
                      data-node={node.id}
                        data-accept={answer === true ? "yes" : typeof answer === "string" ? "no" : undefined}
                        data-over={highlighted || undefined}
                        aria-pressed={selected}
                        aria-disabled={typeof answer === "string" || undefined}
                        aria-label={spokenNode(node)}
                        title={typeof answer === "string" ? answer : node.label}
                        {...nodeDrag.bind(node.id)}
                        onClick={(event) => {
                          if (event.detail === 0) activateNode(node.id);
                        }}
                        onKeyDown={(event) => onNodeKeyDown(event, node.id)}
                      >
                        <span key={pulse?.id === node.id ? pulse.key : "body"} className={styles.nodeBody} data-pulse={pulse?.id === node.id || undefined}>
                          <span className={styles.swatch} aria-hidden="true" />
                          <span className={styles.nodeText}>
                            <span className={styles.nodeLabel}>
                              {node.badge ? <span className={styles.badge}>{node.badge}</span> : null}
                              <span>{node.label}</span>
                              {node.locked ? <LockGlyph /> : null}
                            </span>
                            {node.caption ? <span className={styles.caption}>{node.caption}</span> : null}
                          </span>
                          {node.busy ? <span className={styles.spinner} aria-hidden="true" /> : null}
                        </span>
                        {/*the handle that's drawing must stay mounted, or its pointer capture goes with it*/}
                        {(gesture.kind === "idle" || (gesture.kind === "linking" && gesture.held && gesture.from === node.id)) &&
                        canDrawFrom(node.id) ? (
                          <span className={styles.handle} aria-hidden="true" {...bindHandle(node.id)} />
                        ) : null}
                      </button>
                      {node.toggle ? (
                        <button
                          type="button"
                          className={styles.nodeToggle}
                          style={{ transform: `translate3d(${centre.x + nodeW / 2 - TOGGLE - 8}px, ${headerY - TOGGLE / 2}px, 0)` }}
                          aria-pressed={node.toggle.on}
                          aria-label={node.toggle.label}
                          title={node.toggle.label}
                          //keep the press from reaching the canvas, which would clear the selection
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => {
                            const toggle = node.toggle;
                            if (toggle) void run(toggle.run, node.id);
                          }}
                        >
                          {node.toggle.icon}
                        </button>
                      ) : null}
                      {node.box ? (
                        <div
                          className={styles.boxRows}
                          style={{ width: nodeW, transform: `translate3d(${centre.x - nodeW / 2}px, ${centre.y - nodeH / 2 + NODE_SIZE.h}px, 0)` }}
                          //rows have their own controls; a press here mustn't drag the box or clear the selection
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          {node.box.rows.length === 0 ? (
                            <p className={styles.boxEmpty}>{node.box.empty ?? "Empty"}</p>
                          ) : (
                            <ul className={styles.boxList} aria-label={`${node.label}: items`}>
                              {node.box.rows.map((row) => (
                                <li key={row.id} className={styles.boxRow}>
                                  <span className={styles.swatch} style={{ background: row.color }} aria-hidden="true" />
                                  <span className={styles.boxLabel} title={row.label}>
                                    {row.label}
                                  </span>
                                  {row.choice ? (
                                    <select
                                      className={styles.boxChoice}
                                      aria-label={`${row.choice.label}: ${row.label}`}
                                      value={row.choice.value}
                                      onChange={(event) => {
                                        const choice = row.choice;
                                        const value = event.target.value;
                                        if (choice && value !== choice.value) void run(() => choice.onChange(value), node.id);
                                      }}
                                    >
                                      {row.choice.options.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : null}
                                  {row.remove ? (
                                    <button
                                      type="button"
                                      className={styles.boxRemove}
                                      aria-label={`${row.remove.label}: ${row.label}`}
                                      title={row.remove.label}
                                      onClick={() => {
                                        const remove = row.remove;
                                        if (!remove) return;
                                        //the row goes away with its button, so keep focus on the box, where Delete and ⌘Z still work
                                        rootRef.current?.querySelector<HTMLElement>(`[data-node="${CSS.escape(node.id)}"]`)?.focus({ preventScroll: true });
                                        void run(remove.run, node.id);
                                      }}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                        <path d="M2 2l6 6M8 2l-6 6" />
                                      </svg>
                                    </button>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })
              : null}

            {nodes.length === 0 && empty ? <div className={styles.empty}>{empty}</div> : null}
          </div>
        </div>

        {toast ? (
          <div key={toast.key} className={styles.toast}>
            <span>{toast.message}</span>
            {toast.change ? (
              <button type="button" className={styles.toastButton} onClick={() => undo(toast.change)}>
                Undo
              </button>
            ) : null}
          </div>
        ) : null}

        {functions.length > 0 ? (
          <div className={styles.palette} role="group" aria-label="Functions">
            {groups.map(([group, list]) => (
              <div key={group} className={styles.paletteGroup} role="group" aria-label={group}>
                <span className={styles.paletteHeading} aria-hidden="true">
                  {group}
                </span>
                {list.map((fn) => (
                  <button
                    key={fn.id}
                    ref={(element) => {
                      if (element) chipRefs.current.set(fn.id, element);
                      else chipRefs.current.delete(fn.id);
                    }}
                    type="button"
                    className={styles.chip}
                    aria-pressed={gesture.kind === "armed" && gesture.fnId === fn.id}
                    {...fnDrag.bind(fn.id)}
                    onClick={(event) => {
                      if (event.detail === 0) toggleArm(fn.id);
                    }}
                  >
                    {fn.icon}
                    {fn.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.inspector}>
        {selectedNode ? (
          <>
            <div className={styles.inspectorText}>
              <p className={styles.inspectorTitle}>{selectedNode.label}</p>
              {selectedNode.details?.length ? (
                <ul className={styles.inspectorLines}>
                  {selectedNode.details.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className={styles.inspectorActions}>
              {selectedNode.actions?.map((action) => (
                <button key={action.id} type="button" className={styles.button} onClick={() => void run(action.run, selectedNode.id)}>
                  {action.label}
                </button>
              ))}
              <button type="button" className={styles.button} onClick={() => setSelection(null)}>
                Done
              </button>
            </div>
          </>
        ) : selectedEdge ? (
          <>
            <div className={styles.inspectorText}>
              <p className={styles.inspectorTitle}>
                {selectedEdge.via?.label ?? `${nodeLabel(selectedEdge.from)} → ${nodeLabel(selectedEdge.to)}`}
              </p>
              {selectedEdge.details?.length ? (
                <ul className={styles.inspectorLines}>
                  {selectedEdge.details.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className={styles.inspectorActions}>
              {selectedEdge.actions?.map((action) => (
                <button key={action.id} type="button" className={styles.button} onClick={() => void run(action.run, selectedEdge.to)}>
                  {action.label}
                </button>
              ))}
              {selectedEdge.remove ? (
                <button
                  type="button"
                  className={styles.button}
                  data-tone="danger"
                  aria-keyshortcuts="Delete Backspace"
                  onClick={() => removeEdge(selectedEdge)}
                >
                  {selectedEdge.remove.label ?? "Delete link"}
                </button>
              ) : null}
              <button type="button" className={styles.button} onClick={() => setSelection(null)}>
                Done
              </button>
            </div>
          </>
        ) : (
          <p className={styles.hint}>{status ?? hint ?? "Drag a function onto the map, or drag from a node’s handle to connect two nodes."}</p>
        )}
      </div>

      {ghost ? (
        <div
          className={styles.ghost}
          style={{ transform: `translate3d(${ghost.at.x}px, ${ghost.at.y}px, 0)` }}
          data-absorbing={ghost.absorbing || undefined}
          aria-hidden="true"
        >
          {fnById.get(ghost.fnId)?.icon}
          {fnById.get(ghost.fnId)?.label}
        </div>
      ) : null}

      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
