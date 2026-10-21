import { Quaternion, Vector3 } from "three";

//world units. every band is a box-section ring born in the xy plane, axis +z, y up.
//radius is the centerline, width is radial, depth is along the axis.

export const SPHERE_RADIUS = 0.74;
export const CLEARANCE = 0.08;
export const FOV = 32;

export type BandId = "time" | "date" | "agents" | "features";
export type ReelId = "features" | "agents";

export type OrbitSpec = {
  //outer axis turns in world space, inner axis turns in the tilted band's own frame
  axisA: [number, number, number];
  speedA: number;
  tilt: [number, number, number, number];
  axisB: [number, number, number];
  speedB: number;
};

//a strip of film taped round the outer face. frames repeat the items to fill the band.
export type FilmSpec = {
  frames: number;
  //frame width over frame height once the band opens into a drum
  aspect: number;
};

export type BandSpec = {
  id: BandId;
  kind: "accent" | "film";
  radius: number;
  width: number;
  depth: number;
  orbit: OrbitSpec;
  film?: FilmSpec;
};

function tiltOf(x: number, y: number, z: number): [number, number, number, number] {
  const q = new Quaternion().setFromAxisAngle(new Vector3(x, y, z).normalize(), Math.hypot(x, y, z));
  return [q.x, q.y, q.z, q.w];
}

//inner to outer. thin accent bands are fast and cross each other's planes;
//film bands barely precess and mostly roll, so the strip runs past like a reel.
export const BANDS: readonly BandSpec[] = [
  {
    id: "time",
    kind: "accent",
    radius: 0.98,
    width: 0.04,
    depth: 0.15,
    orbit: { axisA: [1, 0, 0], speedA: 0.95, tilt: tiltOf(0, 0, 0.3), axisB: [0, 1, 0], speedB: 0.62 },
  },
  {
    id: "date",
    kind: "accent",
    radius: 1.2,
    width: 0.04,
    depth: 0.15,
    orbit: { axisA: [0, 0.6, 0.8], speedA: -0.74, tilt: tiltOf(0.9, 0, 0), axisB: [1, 0, 0], speedB: 1.08 },
  },
  {
    id: "agents",
    kind: "film",
    radius: 1.48,
    width: 0.03,
    depth: 0.24,
    orbit: { axisA: [0.35, 1, 0.15], speedA: -0.05, tilt: tiltOf(0.42, 0, 0.95), axisB: [0, 0, 1], speedB: -0.3 },
    film: { frames: 14, aspect: 0.85 },
  },
  {
    id: "features",
    kind: "film",
    radius: 1.86,
    width: 0.03,
    depth: 0.3,
    orbit: { axisA: [0, 1, 0], speedA: 0.06, tilt: tiltOf(1.12, 0, 0), axisB: [0, 0, 1], speedB: 0.26 },
    film: { frames: 10, aspect: 0.85 },
  },
] as const;

export function bandById(id: BandId): BandSpec {
  const band = BANDS.find((item) => item.id === id);
  if (!band) throw new Error(`Unknown band ${id}`);
  return band;
}

export function filmOf(band: BandSpec): FilmSpec {
  if (!band.film) throw new Error(`${band.id} carries no film`);
  return band.film;
}

//scrubbed timeline in beats. each "hold" is a stretch of scroll where one view sits still and takes input.
export const BEATS = {
  hero: [0, 0.7],
  center: [0, 1.1],
  lensOpen: [0.35, 1.6],
  calendarHold: [1.6, 2.8],
  lensClose: [2.8, 3.9],
  featuresOpen: [4.3, 5.4],
  featuresHold: [5.4, 6.8],
  featuresClose: [6.8, 7.9],
  agentsOpen: [8.3, 9.4],
  agentsHold: [9.4, 10.8],
  agentsClose: [10.8, 11.9],
  exit: [12.1, 13.1],
  end: 13.3,
} as const;

export type Phase = "orbit" | "calendar" | "features" | "agents" | "done";

//which view owns input at timeline time t. a little slack each side so a scrub settling short still counts.
export function phaseAt(t: number): Phase {
  const slack = 0.06;
  const within = ([start, end]: readonly [number, number]) => t >= start - slack && t <= end + slack;
  if (t >= BEATS.exit[1]) return "done";
  if (within(BEATS.calendarHold)) return "calendar";
  if (within(BEATS.featuresHold)) return "features";
  if (within(BEATS.agentsHold)) return "agents";
  return "orbit";
}

//scroll fraction of the runway where a beat's hold is centred, for anchors
export function holdFraction(span: readonly [number, number]): number {
  return (span[0] + span[1]) / 2 / BEATS.end;
}

export function wrapAngle(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}

//signed angle from the nearest edge midpoint, in [-π/n, π/n)
export function edgeOffset(theta: number, sides: number, phase: number): number {
  const sector = (Math.PI * 2) / sides;
  return wrapAngle(theta - phase, sector) - sector / 2;
}

//radial scale that turns a circle of inradius r into a regular polygon with the same inradius.
//1 on edge midpoints, 1/cos(π/n) on corners. mirrored in the band vertex shader.
export function polygonFactor(theta: number, morph: number, sides: number, phase: number): number {
  return 1 + (1 / Math.cos(edgeOffset(theta, sides, phase)) - 1) * morph;
}

//film frame k is centred on θ = k·sector, so the polygon's edge midpoints land on frame centres
export function filmPhase(film: FilmSpec): number {
  return -Math.PI / film.frames;
}

export function frameTheta(film: FilmSpec, frame: number): number {
  return (frame / film.frames) * Math.PI * 2;
}

//the flat face a frame becomes, measured on the outer skin of the band
export function frameSize(band: BandSpec): { width: number; height: number; inradius: number } {
  const film = filmOf(band);
  const inradius = band.radius + band.width / 2;
  const width = 2 * inradius * Math.tan(Math.PI / film.frames);
  return { width, height: width / film.aspect, inradius };
}

//band depth once it is a drum, over its depth in orbit
export function drumStretch(band: BandSpec): number {
  return frameSize(band).height / band.depth;
}

//spherical shell a band sweeps at any orientation, as a circle
export function orbitShell(band: BandSpec): { min: number; max: number } {
  return {
    min: band.radius - band.width / 2,
    max: Math.hypot(band.radius + band.width / 2, band.depth / 2),
  };
}

export type ClearanceReport = { pair: string; gap: number }[];

export function clearanceReport(): ClearanceReport {
  const report: ClearanceReport = [];
  report.push({ pair: `sphere/${BANDS[0].id}`, gap: orbitShell(BANDS[0]).min - SPHERE_RADIUS });
  for (let i = 1; i < BANDS.length; i += 1) {
    const inner = BANDS[i - 1];
    const outer = BANDS[i];
    report.push({ pair: `${inner.id}/${outer.id}`, gap: orbitShell(outer).min - orbitShell(inner).max });
  }
  return report;
}

const scratchA = new Quaternion();
const scratchB = new Quaternion();
const scratchTilt = new Quaternion();
const scratchAxis = new Vector3();
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

//q = A(angleA) · tilt · B(angleB)
export function orbitQuaternion(spec: OrbitSpec, angleA: number, angleB: number, out: Quaternion): Quaternion {
  scratchA.setFromAxisAngle(scratchAxis.set(...spec.axisA).normalize(), angleA);
  scratchTilt.set(...spec.tilt);
  scratchB.setFromAxisAngle(scratchAxis.set(...spec.axisB).normalize(), angleB);
  return out.copy(scratchA).multiply(scratchTilt).multiply(scratchB);
}

//the open reel: axis stood upright and leaned back a touch so the top lip shows
export const DRUM_LEAN = -0.13;

//band roll that brings frame `pose` (fractional) to the front, facing +z
export function drumSpin(film: FilmSpec, pose: number): number {
  return -Math.PI / 2 - frameTheta(film, pose);
}

//q = Rx(lean − π/2) · Rz(spin): local z becomes world up, then the roll turns the strip past the viewer
export function drumQuaternion(spin: number, out: Quaternion): Quaternion {
  scratchA.setFromAxisAngle(X_AXIS, DRUM_LEAN - Math.PI / 2);
  scratchB.setFromAxisAngle(Z_AXIS, spin);
  return out.copy(scratchA).multiply(scratchB);
}

//camera distance so `extent` fits the shorter side of a canvas with this aspect
export function fitDistance(extent: number, aspect: number, fov = FOV): number {
  const half = Math.tan((fov * Math.PI) / 360);
  return extent / (half * Math.min(1, aspect));
}

//focal length in pixels: a unit at distance d spans focal / d pixels
export function focalPx(canvasHeight: number, fov = FOV): number {
  return canvasHeight / (2 * Math.tan((fov * Math.PI) / 360));
}

//projected radius of a sphere's silhouette, for a sphere centred on the view axis
export function silhouettePx(focal: number, distance: number, radius: number): number {
  return (focal * radius) / Math.sqrt(Math.max(1e-6, distance * distance - radius * radius));
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

export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
