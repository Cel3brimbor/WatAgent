import { Vector3, type Camera, type Quaternion } from "three";
import {
  SPHERE_RADIUS,
  bandById,
  bandRadius,
  lerp,
  pixelsPerUnit,
  plaqueTheta,
  smoothstep,
  staggered,
  type BandId,
} from "./citadel-math";

//GSAP tweens these numbers on a scrubbed timeline; useFrame reads them. no React state in between.
export type Rig = {
  spin: number;
  align: number;
  morph: number;
  thick: number;
  accent: number;
  fly: number;
  lens: number;
  ring: number;
};

export function createRig(): Rig {
  return { spin: 1, align: 0, morph: 0, thick: 0, accent: 1, fly: 0, lens: 0, ring: 1 };
}

export type FlightKind = "features" | "agents" | "lens";

type Box = { x: number; y: number; w: number; h: number };

export type FlightEntry = {
  kind: FlightKind;
  index: number;
  count: number;
  //untransformed layout box in the page; node is the child that flies
  slot: HTMLElement;
  node: HTMLElement;
  //lens only: sphere shading that fades as the iris opens
  shade?: HTMLElement | null;
  doc: Box;
};

export type FlightRegistry = {
  entries: Map<string, FlightEntry>;
  register: (key: string, entry: Omit<FlightEntry, "doc">) => () => void;
  measure: () => void;
  reset: () => void;
};

function docBox(el: HTMLElement): Box {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, w: rect.width, h: rect.height };
}

export function createFlightRegistry(): FlightRegistry {
  const entries = new Map<string, FlightEntry>();
  const clear = (entry: FlightEntry) => {
    const { style } = entry.node;
    style.transform = "";
    style.opacity = "";
    style.zIndex = "";
    style.clipPath = "";
    style.removeProperty("--lens-r");
    if (entry.shade) entry.shade.style.opacity = "";
  };
  return {
    entries,
    register(key, entry) {
      const full: FlightEntry = { ...entry, doc: docBox(entry.slot) };
      entries.set(key, full);
      return () => {
        clear(full);
        if (entries.get(key) === full) entries.delete(key);
      };
    },
    //reads only. slot boxes ignore the child's transform, so this is safe mid-flight.
    measure() {
      for (const entry of entries.values()) entry.doc = docBox(entry.slot);
    },
    reset() {
      for (const entry of entries.values()) clear(entry);
    },
  };
}

const PLAQUE_WORLD: Record<Exclude<FlightKind, "lens">, [number, number]> = {
  features: [0.6, 0.9],
  agents: [0.46, 0.7],
};

const world = new Vector3();
const ndc = new Vector3();

type Viewport = { left: number; top: number; width: number; height: number };

//one pass per frame: every read (scrollY, cached boxes) before every write (transform strings)
export function writeFlight(
  registry: FlightRegistry,
  rig: Rig,
  camera: Camera,
  canvas: Viewport,
  bandQuaternions: Record<BandId, Quaternion>,
) {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const distance = camera.position.length();
  const ppu = pixelsPerUnit(canvas.height, distance);
  const centerX = canvas.left + canvas.width / 2;
  const centerY = canvas.top + canvas.height / 2;

  for (const entry of registry.entries.values()) {
    const slotX = entry.doc.x - scrollX + entry.doc.w / 2;
    const slotY = entry.doc.y - scrollY + entry.doc.h / 2;
    const { style } = entry.node;

    if (entry.kind === "lens") {
      //silhouette radius of a sphere at this distance, a little inside the metal rim
      const rimPx = ((ppu * distance * SPHERE_RADIUS) / Math.sqrt(distance * distance - SPHERE_RADIUS * SPHERE_RADIUS)) * 0.93;
      const startScale = Math.min(0.62, Math.max(0.26, (rimPx * 2 * 1.7) / entry.doc.w));
      const t = rig.lens;
      const scale = lerp(startScale, 1, t);
      const x = lerp(centerX, slotX, t) - slotX;
      const y = lerp(centerY, slotY, t) - slotY;
      const open = Math.hypot(entry.doc.w, entry.doc.h) / 2 + 2;
      const radius = lerp(rimPx / startScale, open, t * t);
      style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      style.clipPath = t >= 1 ? "" : `circle(${radius.toFixed(1)}px at 50% 50%)`;
      style.setProperty("--lens-r", `${radius.toFixed(1)}px`);
      style.zIndex = "50";
      if (entry.shade) entry.shade.style.opacity = String(1 - smoothstep(0, 0.6, t));
      continue;
    }

    const band = bandById(entry.kind);
    const theta = plaqueTheta(entry.index, entry.count);
    const radius = bandRadius(band, theta, 0, rig.morph, 1);
    world.set(Math.cos(theta) * radius, Math.sin(theta) * radius, 0).applyQuaternion(bandQuaternions[entry.kind]);
    //+z faces the camera, so world.z / radius is how much the plaque faces the viewer
    const facing = world.z / radius;
    ndc.copy(world).project(camera);
    const ringX = canvas.left + (ndc.x * 0.5 + 0.5) * canvas.width;
    const ringY = canvas.top + (-ndc.y * 0.5 + 0.5) * canvas.height;
    const [small, large] = PLAQUE_WORLD[entry.kind];
    const perspective = distance / Math.max(0.1, distance - world.z);
    const ringScale = (ppu * lerp(small, large, rig.thick) * perspective) / entry.doc.w;

    const t = staggered(rig.fly, entry.index, entry.count);
    const ease = t * t * (3 - 2 * t);
    const x = lerp(ringX, slotX, ease) - slotX;
    const y = lerp(ringY, slotY, ease) - slotY;
    const scale = lerp(ringScale, 1, ease);
    //depth cues only matter while the band is tilted; once it faces the camera every plaque is front
    const faceAlpha = lerp(lerp(0.16, 1, smoothstep(-0.55, 0.25, facing)), 1, rig.align);
    style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    style.opacity = String(lerp(faceAlpha, 1, ease).toFixed(3));
    //behind the sphere sorts under the lens (50), in front sorts over it
    style.zIndex = String(Math.round(lerp(50 + facing * 40 * (1 - rig.align), 10, ease)));
  }
}
