//world units. torusgeometry is born in the xy plane, y-up.
export const R0 = 2.55
export const R1 = 1.95
export const TUBE0 = 0.07
export const TUBE1 = 0.05
export const RS = 0.78
export const SPHERE_GAP = 0.12

export type FlightPose = {
  x: number
  y: number
  scale: number
  opacity: number
  radius: number
}

export type SlotBox = {
  left: number
  top: number
  width: number
  height: number
}

export type FlightFrame = {
  x: number
  y: number
  scale: number
  opacity: number
  transform: string
}

export type CitadelPoses = {
  ready: boolean
  calendar: FlightPose
  features: FlightPose[]
  agents: FlightPose[]
}

export type CitadelRig = {
  spin: number
  flatten: number
  sphereFlat: number
  ringOpacity: number
}

export function sphereClearsInnerRing(): boolean {
  return RS + SPHERE_GAP < R1 - TUBE1
}

export function thetaAt(index: number, count: number): number {
  return (index / count) * Math.PI * 2 - Math.PI / 2
}

//each step is one slice, and the wrap from the last plaque back to the first is the same slice
export function thetasCoverOneTurn(count: number): boolean {
  if (count < 1) return false
  const step = (Math.PI * 2) / count
  for (let i = 1; i < count; i += 1) {
    if (Math.abs(thetaAt(i, count) - thetaAt(i - 1, count) - step) > 1e-9) return false
  }
  const closing = thetaAt(0, count) + Math.PI * 2 - thetaAt(count - 1, count)
  return Math.abs(closing - step) < 1e-9
}

export function cameraZ(): number {
  return ((R0 + TUBE0) / Math.tan((32 * Math.PI) / 360)) * 1.08
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

export function plaqueScale(distance: number): number {
  return Math.min(1.15, Math.max(0.45, 3.1 / distance))
}

//back-facing plaques drop out. 0.15 is the cutoff, then a short ramp so the edge doesn't pop
export function facingOpacity(dot: number): number {
  if (dot <= 0.15) return 0
  if (dot >= 0.5) return 1
  const t = (dot - 0.15) / 0.35
  return t * t * (3 - 2 * t)
}

export function projectToViewport(
  ndcX: number,
  ndcY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: (ndcX * 0.5 + 0.5) * rect.width + rect.left,
    y: (-ndcY * 0.5 + 0.5) * rect.height + rect.top,
  }
}

//translate is the element's top-left. origin stays the center, so the plaque center sits on the ring point
export function flightFrame(pose: FlightPose, slot: SlotBox, u: number): FlightFrame {
  const t = Math.min(1, Math.max(0, u))
  const x = lerp(pose.x - slot.width / 2, slot.left, t)
  const y = lerp(pose.y - slot.height / 2, slot.top, t)
  const scale = lerp(pose.scale, 1, t)
  const opacity = lerp(pose.opacity, 1, t)
  return {
    x,
    y,
    scale,
    opacity,
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
  }
}

//circle is in the element's own pixels, before the css scale, so the on-screen window matches the sphere
export function openClip(open: number, screenRadius: number, scale: number, width: number, height: number): string {
  if (open >= 1 || width < 1 || height < 1) return ""
  const cover = Math.hypot(width, height) / 2
  const start = screenRadius / Math.max(scale, 0.05)
  const radius = lerp(start, cover, Math.min(1, Math.max(0, open)))
  if (radius >= cover - 0.5) return ""
  return `circle(${radius}px at 50% 50%)`
}
