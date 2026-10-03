import type { ReactNode } from "react";

/** Centre of a node, normalised to the canvas: 0..1 on each axis. */
export type MapPoint = { x: number; y: number };

/** Lane a node starts in before anyone drags it: one hub in the middle, two columns either side. */
export type MapNodeGroup = "hub" | "left" | "right";

export type MapNode = {
  id: string;
  label: string;
  /** Any CSS color, drawn as the node's swatch. */
  color: string;
  group: MapNodeGroup;
  /** Short leading badge, such as a rank. */
  badge?: string;
  /** Second line under the label. */
  caption?: string;
  /** Hidden from the calendar it stands for. */
  dimmed?: boolean;
  /** Read only. */
  locked?: boolean;
  /** An action on this node is running. */
  busy?: boolean;
  /** Lines the inspector shows when the node is selected. */
  details?: string[];
  /** Buttons the inspector shows when the node is selected. */
  actions?: MapAction[];
};

export type MapChange = {
  /** Announced and shown in the toast. */
  message: string;
  /** Present when the change can be reversed. */
  undo?: () => void;
};

type Outcome = MapChange | void | Promise<MapChange | void>;

export type MapAction = { id: string; label: string; run: () => Outcome };
export type MapEdgeAction = MapAction;

export type MapEdge = {
  id: string;
  from: string;
  to: string;
  /** Short text beside the line, such as "37 shared". */
  label?: string;
  /** 0..1, drawn as line weight. */
  weight?: number;
  /** Arrowhead at `to`. */
  directed?: boolean;
  dash?: "dashed" | "dotted";
  tone?: "neutral" | "accent";
  faint?: boolean;
  /** A pill sitting on the line, such as a rule's name. Selecting it selects the edge. */
  via?: { label: string };
  details?: string[];
  actions?: MapEdgeAction[];
  /** Present when the link can be deleted: a Delete button in the inspector, and Delete or Backspace while it's selected. */
  remove?: { label?: string; run: () => Outcome };
};

type FunctionBase = {
  id: string;
  label: string;
  /** Palette group heading. */
  group: string;
  icon?: ReactNode;
  /** Status line while the function is armed, e.g. "choose a calendar". */
  prompt?: string;
};

/** Dropped on one node. */
export type MapNodeFunction = FunctionBase & {
  kind: "node";
  /** true, or the reason this node can't take it. */
  accepts: (nodeId: string) => true | string;
  apply: (nodeId: string) => Outcome;
};

/** Dropped on one node, then connected to another. */
export type MapLinkFunction = FunctionBase & {
  kind: "link";
  acceptsFrom: (nodeId: string) => true | string;
  accepts: (fromId: string, toId: string) => true | string;
  apply: (fromId: string, toId: string) => Outcome;
  /** Also started by dragging from a node's handle. */
  drawable?: boolean;
};

export type MapFunction = MapNodeFunction | MapLinkFunction;

/** Dragging one node onto another, such as a calendar onto the Agent. */
export type MapNodeDrop = {
  accepts: (draggedId: string, targetId: string) => true | string;
  apply: (draggedId: string, targetId: string) => Outcome;
};

export type LayoutStore = {
  load: () => Record<string, MapPoint>;
  save: (positions: Record<string, MapPoint>) => void;
};
