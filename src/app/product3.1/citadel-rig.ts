import { Vector3, type Quaternion } from "three";
import { createDial, type Dial } from "./citadel-dial";
import { filmItems, type Prints } from "./citadel-film";
import { BANDS, clamp01, filmOf, frameSize, lerp, smoothstep, wrap, type BandSpec, type ReelId } from "./citadel-math";

//GSAP tweens these numbers on a scrubbed timeline; useFrame reads them. no React state in between.
export type Rig = {
  //hero anchor → middle of the stage
  center: number;
  //calendar out of the sphere and back
  lens: number;
  //a film band opening into a drum and back
  features: number;
  agents: number;
  //the whole astrolabe leaving at the end
  exit: number;
};

export function createRig(): Rig {
  return { center: 0, lens: 0, features: 0, agents: 0, exit: 0 };
}

export type Dials = Record<ReelId, Dial>;

export function createDials(): Dials {
  const dials = {} as Dials;
  for (const band of BANDS) {
    if (band.kind !== "film") continue;
    const id = band.id as ReelId;
    dials[id] = createDial(filmOf(band).frames, filmItems(id).length);
  }
  return dials;
}

//the DOM pieces the scene positions each frame. React owns their content, the scene owns their transforms.
export type StageDom = {
  lens: HTMLElement | null;
  shade: HTMLElement | null;
  lensSize: { w: number; h: number };
  layers: Record<ReelId, HTMLElement | null>;
  cards: Record<ReelId, (HTMLElement | null)[]>;
  //photographs of the live cards, painted onto the film; the scene repaints when a version moves
  prints: Record<ReelId, Prints>;
  printVersion: Record<ReelId, number>;
};

export function createStageDom(): StageDom {
  return {
    lens: null,
    shade: null,
    lensSize: { w: 1, h: 1 },
    layers: { features: null, agents: null },
    cards: { features: [], agents: [] },
    prints: { features: [], agents: [] },
    printVersion: { features: 0, agents: 0 },
  };
}

export type View = { width: number; height: number; focal: number; distance: number };

//sphere as it sits on screen: centre offset from the stage middle, and silhouette radius, in px
export type SphereShot = { x: number; y: number; rim: number; alpha: number };

const LENS_PAD = 20;
const CAPTION_ROOM = 40;

export function writeLens(dom: StageDom, view: View, sphere: SphereShot, lens: number) {
  const node = dom.lens;
  if (!node) return;
  const { style } = node;
  const { w, h } = dom.lensSize;
  const t = clamp01(lens);
  if (sphere.alpha < 0.01 && t <= 0) {
    style.visibility = "hidden";
    return;
  }
  style.visibility = "visible";
  const rimPx = sphere.rim * 0.93;
  //inside the sphere the calendar is zoomed in, so the iris shows a readable piece of the week
  const startScale = Math.min(0.62, Math.max(0.16, (rimPx * 2 * 1.7) / w));
  const fit = Math.min(1, (view.width - LENS_PAD * 2) / w, (view.height - LENS_PAD * 2 - CAPTION_ROOM) / h);
  const scale = lerp(startScale, fit, t);
  const x = lerp(sphere.x, 0, t);
  const y = lerp(sphere.y, CAPTION_ROOM / 2, t);
  const open = Math.hypot(w, h) / 2 + 2;
  const radius = lerp(rimPx / startScale, open, t * t);
  style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  style.clipPath = t >= 0.999 ? "" : `circle(${radius.toFixed(1)}px at 50% 50%)`;
  style.setProperty("--lens-r", `${radius.toFixed(1)}px`);
  style.opacity = t > 0 ? "" : sphere.alpha.toFixed(3);
  if (dom.shade) dom.shade.style.opacity = String(1 - smoothstep(0, 0.6, t));
}

//the open drum's front frame on screen: how wide, and where its centre sits
export function drumShot(view: { width: number; height: number }): { framePx: number; centerY: number } {
  const { width, height } = view;
  const narrow = width < 760;
  const framePx = Math.round(Math.min(420, width * (narrow ? 0.84 : 0.8), height * 0.62 * 0.85));
  return { framePx, centerY: height * (narrow ? 0.47 : 0.49) };
}

const right = new Vector3();
const up = new Vector3();
const normal = new Vector3();
const centre = new Vector3();

//world → css: x right, y down, z toward the viewer; one world unit is focal / distance px at the origin
function css(v: Vector3, k: number, point: boolean, out: number[], at: number) {
  out[at] = v.x * k;
  out[at + 1] = -v.y * k;
  out[at + 2] = v.z * k;
  out[at + 3] = point ? 1 : 0;
}

const matrix = new Array<number>(16).fill(0);

//each item's card rides the face nearest the front that shows it. cards fade in only once the drum is open.
export function writeCards(
  dom: StageDom,
  reel: ReelId,
  band: BandSpec,
  dial: Dial,
  open: number,
  position: Vector3,
  quaternion: Quaternion,
  scale: number,
  view: View,
) {
  const layer = dom.layers[reel];
  const cards = dom.cards[reel];
  if (!layer) return;
  const shown = smoothstep(0.92, 1, open);
  //display, not visibility: a card's own visibility would override a hidden parent
  if (shown <= 0) {
    if (layer.style.display !== "none") layer.style.display = "none";
    return;
  }
  if (layer.style.display) layer.style.display = "";
  const film = filmOf(band);
  const size = frameSize(band);
  const sector = (Math.PI * 2) / film.frames;
  const k = view.focal / view.distance;
  const base = Math.round(dial.pose);
  const items = dial.items;
  const cardW = parseFloat(layer.style.getPropertyValue("--card-w")) || 400;
  const unit = (size.width * scale) / cardW;

  cards.forEach((node, item) => {
    if (!node) return;
    let steps = wrap(item - base, items);
    if (steps > items / 2) steps -= items;
    const frame = base + steps;
    const delta = frame - dial.pose;
    const alpha = shown * (1 - smoothstep(0.18, 0.62, Math.abs(delta)));
    const { style } = node;
    if (alpha < 0.01) {
      if (style.visibility !== "hidden") style.visibility = "hidden";
      return;
    }
    const theta = frame * sector;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    right.set(-s, c, 0).applyQuaternion(quaternion);
    up.set(0, 0, 1).applyQuaternion(quaternion);
    normal.set(c, s, 0).applyQuaternion(quaternion);
    centre.set(c * size.inradius * scale, s * size.inradius * scale, 0).applyQuaternion(quaternion).add(position);
    //a hair proud of the film so the card reads as printed on it, never sunk behind
    centre.addScaledVector(normal, 0.004);
    css(right.multiplyScalar(unit), k, false, matrix, 0);
    css(up.multiplyScalar(-unit), k, false, matrix, 4);
    css(normal.multiplyScalar(unit), k, false, matrix, 8);
    css(centre, k, true, matrix, 12);
    style.visibility = "visible";
    style.opacity = alpha.toFixed(3);
    style.transform = `matrix3d(${matrix.map((value) => value.toFixed(5)).join(",")})`;
    style.pointerEvents = open >= 0.98 && Math.abs(delta) < 0.3 ? "" : "none";
  });
}
