import { Quaternion, Vector3 } from "three";

//world units. every band is a box-section ring born in the xy plane, axis +z, y up.
//radius is the centerline, width is radial, depth is along the axis.

export const SIDES = 5;
const SECTOR = (Math.PI * 2) / SIDES;
//corners sit half a sector off the top, so the top of every band is an edge midpoint
export const CORNER_PHASE = Math.PI / 2 + SECTOR / 2;

export const SPHERE_RADIUS = 0.74;
export const MAX_THICK = 1.6;
export const CLEARANCE = 0.08;
export const FOV = 32;

export type BandId = "time" | "date" | "agents" | "features";

export type OrbitSpec = {
  //outer axis turns in world space, inner axis turns in the tilted band's own frame
  axisA: [number, number, number];
  speedA: number;
  tilt: [number, number, number, number];
  axisB: [number, number, number];
  speedB: number;
};

export type BandSpec = {
  id: BandId;
  kind: "primary" | "accent";
  radius: number;
  width: number;
  depth: number;
  orbit: OrbitSpec;
};

function tiltOf(x: number, y: number, z: number): [number, number, number, number] {
  const q = new Quaternion().setFromAxisAngle(new Vector3(x, y, z).normalize(), Math.hypot(x, y, z));
  return [q.x, q.y, q.z, q.w];
}

//inner to outer. thin accent bands are fast and cross each other's planes;
//primary bands precess slowly and roll their plaques along the rim.
export const BANDS: readonly BandSpec[] = [
  {
    id: "time",
    kind: "accent",
    radius: 0.98,
    width: 0.04,
    depth: 0.11,
    orbit: { axisA: [1, 0, 0], speedA: 0.95, tilt: tiltOf(0, 0, 0.3), axisB: [0, 1, 0], speedB: 0.62 },
  },
  {
    id: "date",
    kind: "accent",
    radius: 1.2,
    width: 0.04,
    depth: 0.11,
    orbit: { axisA: [0, 0.6, 0.8], speedA: -0.74, tilt: tiltOf(0.9, 0, 0), axisB: [1, 0, 0], speedB: 1.08 },
  },
  {
    id: "agents",
    kind: "primary",
    radius: 1.48,
    width: 0.16,
    depth: 0.05,
    orbit: { axisA: [0.35, 1, 0.15], speedA: -0.12, tilt: tiltOf(0.42, 0, 0.95), axisB: [0, 0, 1], speedB: -0.18 },
  },
  {
    id: "features",
    kind: "primary",
    radius: 1.86,
    width: 0.2,
    depth: 0.06,
    orbit: { axisA: [0, 1, 0], speedA: 0.16, tilt: tiltOf(1.1, 0, 0), axisB: [0, 0, 1], speedB: 0.22 },
  },
] as const;

export function bandById(id: BandId): BandSpec {
  const band = BANDS.find((item) => item.id === id);
  if (!band) throw new Error(`Unknown band ${id}`);
  return band;
}

//scrubbed timeline, in timeline seconds (total 1). morph only starts once every band
//faces the camera, because nested polygons are only disjoint when they are coplanar.
export const TIMELINE = {
  hero: [0, 0.14],
  spin: [0, 0.3],
  align: [0.08, 0.4],
  morph: [0.4, 0.62],
  thick: [0.46, 0.66],
  accent: [0.5, 0.68],
  fly: [0.6, 0.95],
  lens: [0.6, 0.95],
  ring: [0.8, 0.94],
  settled: 0.97,
} as const;

export function wrapAngle(value: number, period: number): number {
  return ((value % period) + period) % period;
}

//signed angle from the nearest edge midpoint, in [-π/n, π/n)
export function edgeOffset(theta: number, sides = SIDES, phase = CORNER_PHASE): number {
  const sector = (Math.PI * 2) / sides;
  return wrapAngle(theta - phase, sector) - sector / 2;
}

//radial scale that turns a circle of inradius r into a regular polygon with the same inradius.
//1 on edge midpoints, 1/cos(π/n) on corners. mirrored in the band vertex shader.
export function polygonFactor(theta: number, morph: number, sides = SIDES, phase = CORNER_PHASE): number {
  return 1 + (1 / Math.cos(edgeOffset(theta, sides, phase)) - 1) * morph;
}

//radius of a point on a band. d is its radial offset from the centerline.
export function bandRadius(band: BandSpec, theta: number, d: number, morph: number, thick: number): number {
  return (band.radius + d * thick) * polygonFactor(theta, morph);
}

export function thickScale(band: BandSpec, thick: number): number {
  return band.kind === "primary" ? 1 + (MAX_THICK - 1) * thick : 1;
}

//slide i of n, clockwise from the top edge midpoint
export function plaqueTheta(index: number, count: number): number {
  return Math.PI / 2 - (index / count) * Math.PI * 2;
}

//spherical shell a band sweeps at any orientation, as a circle (morph 0)
export function orbitShell(band: BandSpec): { min: number; max: number } {
  return {
    min: band.radius - band.width / 2,
    max: Math.hypot(band.radius + band.width / 2, band.depth / 2),
  };
}

//in-plane inradii of the band's two edges once it is a flat polygon
export function flatInradii(band: BandSpec, thick = 1): { inner: number; outer: number } {
  const half = (band.width / 2) * thickScale(band, thick);
  return { inner: band.radius - half, outer: band.radius + half };
}

export type ClearanceReport = { pair: string; phase: "orbit" | "flat"; gap: number }[];

export function clearanceReport(): ClearanceReport {
  const report: ClearanceReport = [];
  report.push({ pair: `sphere/${BANDS[0].id}`, phase: "orbit", gap: orbitShell(BANDS[0]).min - SPHERE_RADIUS });
  for (let i = 1; i < BANDS.length; i += 1) {
    const inner = BANDS[i - 1];
    const outer = BANDS[i];
    const pair = `${inner.id}/${outer.id}`;
    report.push({ pair, phase: "orbit", gap: orbitShell(outer).min - orbitShell(inner).max });
    report.push({ pair, phase: "flat", gap: flatInradii(outer, 1).inner - flatInradii(inner, 1).outer });
  }
  return report;
}

const scratchA = new Quaternion();
const scratchB = new Quaternion();
const scratchTilt = new Quaternion();
const scratchAxis = new Vector3();
const IDENTITY = new Quaternion();

//q = A(angleA) · tilt · B(angleB), then slerp toward identity (facing the camera) by align
export function orbitQuaternion(spec: OrbitSpec, angleA: number, angleB: number, align: number, out: Quaternion): Quaternion {
  scratchA.setFromAxisAngle(scratchAxis.set(...spec.axisA).normalize(), angleA);
  scratchTilt.set(...spec.tilt);
  scratchB.setFromAxisAngle(scratchAxis.set(...spec.axisB).normalize(), angleB);
  out.copy(scratchA).multiply(scratchTilt).multiply(scratchB);
  if (align > 0) out.slerp(IDENTITY, align);
  return out;
}

//camera distance so `extent` fits the shorter side of a canvas with this aspect
export function fitDistance(extent: number, aspect: number, fov = FOV): number {
  const half = Math.tan((fov * Math.PI) / 360);
  return extent / (half * Math.min(1, aspect));
}

//pixels per world unit at the origin plane
export function pixelsPerUnit(canvasHeight: number, distance: number, fov = FOV): number {
  return canvasHeight / (2 * Math.tan((fov * Math.PI) / 360) * distance);
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

//per-card fly progress, so plaques leave the rim one after another
export function staggered(progress: number, index: number, count: number, step = 0.06): number {
  const span = 1 - step * Math.max(0, count - 1);
  return clamp01((progress - index * step) / span);
}
