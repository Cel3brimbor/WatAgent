import { wrap } from "./citadel-math";

//the reel's roll, in frames. pose stays unwrapped so turning past the last item keeps going the same way.
//the scene integrates it every frame; pointer handlers and buttons only move the target.
export type Dial = {
  frames: number;
  items: number;
  pose: number;
  target: number;
  velocity: number;
  response: number;
  damping: number;
  dragging: boolean;
  //on-screen width of the front frame, so a drag of one frame width turns one frame
  framePx: number;
  onSettle: ((item: number) => void) | null;
  lastItem: number;
};

export function createDial(frames: number, items: number): Dial {
  return {
    frames,
    items,
    pose: 0,
    target: 0,
    velocity: 0,
    response: 0.4,
    damping: 1,
    dragging: false,
    framePx: 360,
    onSettle: null,
    lastItem: 0,
  };
}

export function itemAt(dial: Dial, pose: number): number {
  return wrap(Math.round(pose), dial.items);
}

function aim(dial: Dial, target: number, flicked: boolean) {
  dial.target = target;
  dial.response = flicked ? 0.42 : 0.34;
  dial.damping = flicked ? 0.82 : 1;
  if (!flicked) dial.velocity = 0;
  const item = itemAt(dial, target);
  if (item !== dial.lastItem) {
    dial.lastItem = item;
    dial.onSettle?.(item);
  }
}

//nearest frame showing `item`, whichever way round is shorter
export function dialTo(dial: Dial, item: number) {
  const delta = wrap(item - dial.target, dial.items);
  const steps = delta > dial.items / 2 ? delta - dial.items : delta;
  aim(dial, Math.round(dial.target) + steps, false);
}

export function dialStep(dial: Dial, dir: number) {
  aim(dial, Math.round(dial.target) + dir, false);
}

export function dialRelease(dial: Dial, projectedFrames: number, releaseFramesPerS: number) {
  dial.dragging = false;
  const landed = Math.round(dial.pose + projectedFrames);
  const distance = landed - dial.pose;
  //cap the carried speed so a short flick doesn't overshoot by a frame
  dial.velocity = Math.sign(releaseFramesPerS) * Math.min(Math.abs(releaseFramesPerS), Math.max(0.8, Math.abs(distance) * 3));
  aim(dial, landed, true);
}

//critically damped spring toward the target. true while still moving.
export function stepDial(dial: Dial, dt: number): boolean {
  if (dial.dragging) return true;
  const omega = (2 * Math.PI) / dial.response;
  const accel = -omega * omega * (dial.pose - dial.target) - 2 * dial.damping * omega * dial.velocity;
  dial.velocity += accel * dt;
  dial.pose += dial.velocity * dt;
  if (!Number.isFinite(dial.pose) || !Number.isFinite(dial.velocity)) {
    dial.pose = dial.target;
    dial.velocity = 0;
  }
  if (Math.abs(dial.pose - dial.target) < 0.0005 && Math.abs(dial.velocity) < 0.005) {
    dial.pose = dial.target;
    dial.velocity = 0;
    //fold far-travelled poses back so floats stay small; whole multiples of the frame count look identical
    if (Math.abs(dial.pose) > dial.frames * 8) {
      const folded = wrap(dial.pose, dial.frames);
      dial.pose = folded;
      dial.target = folded;
    }
    return false;
  }
  return true;
}
