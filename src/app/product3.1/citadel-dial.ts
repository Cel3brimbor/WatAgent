import { wrap } from "./citadel-math";

//rolling friction on a released reel, in frames/s². a hard flick (~5 frames/s) coasts ~4 frames over ~1.7s.
const FRICTION = 3;
//below this the release is a nudge, not a throw: just settle on the nearest frame
const THROW = 0.6;
//the hardest throw the reel takes, in frames/s: ~8 frames over ~2.3s
const MAX_SPEED = 7;

//the reel's roll, in frames. pose stays unwrapped so turning past the last item keeps going the same way.
//the scene integrates it every frame; pointer handlers and buttons only move the target.
export type Dial = {
  frames: number;
  items: number;
  pose: number;
  target: number;
  velocity: number;
  response: number;
  dragging: boolean;
  //a throw in flight: constant deceleration from `from` that comes to rest exactly on `target`
  coast: { from: number; speed: number; decel: number; time: number; duration: number } | null;
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
    response: 0.34,
    dragging: false,
    coast: null,
    framePx: 360,
    onSettle: null,
    lastItem: 0,
  };
}

export function itemAt(dial: Dial, pose: number): number {
  return wrap(Math.round(pose), dial.items);
}

function announce(dial: Dial) {
  const item = itemAt(dial, dial.target);
  if (item === dial.lastItem) return;
  dial.lastItem = item;
  dial.onSettle?.(item);
}

//critically damped spring onto a frame: buttons, dots, keys, and nudges
function aim(dial: Dial, target: number) {
  dial.coast = null;
  dial.target = target;
  dial.response = 0.34;
  dial.velocity = 0;
  announce(dial);
}

//nearest frame showing `item`, whichever way round is shorter
export function dialTo(dial: Dial, item: number) {
  const delta = wrap(item - dial.target, dial.items);
  const steps = delta > dial.items / 2 ? delta - dial.items : delta;
  aim(dial, Math.round(dial.target) + steps);
}

export function dialStep(dial: Dial, dir: number) {
  aim(dial, Math.round(dial.target) + dir);
}

//grabbing a coasting reel catches it where it is
export function dialGrab(dial: Dial) {
  dial.coast = null;
  dial.velocity = 0;
  dial.dragging = true;
}

//let go at `speed` frames/s. the throw travels v²/2a, rounded to a whole frame, and the deceleration is
//re-solved so it lands there exactly: faster throws go further and take longer, and never stop between slides.
export function dialRelease(dial: Dial, release: number) {
  dial.dragging = false;
  const speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, release));
  const natural = (speed * Math.abs(speed)) / (2 * FRICTION);
  const landed = Math.round(dial.pose + natural);
  const distance = landed - dial.pose;
  if (Math.abs(speed) < THROW || Math.abs(distance) < 0.05 || Math.sign(distance) !== Math.sign(speed)) {
    aim(dial, Math.round(dial.pose));
    return;
  }
  //keep the hand's speed at release unless that would overshoot the frame; then ease it down to fit
  const v = Math.sign(speed) * Math.min(Math.abs(speed), Math.sqrt(2 * FRICTION * 2.5 * Math.abs(distance)));
  const decel = (v * v) / (2 * Math.abs(distance));
  dial.coast = { from: dial.pose, speed: v, decel, time: 0, duration: Math.abs(v) / decel };
  dial.target = landed;
  dial.velocity = v;
  announce(dial);
}

//true while still moving
export function stepDial(dial: Dial, dt: number): boolean {
  if (dial.dragging) return true;
  const coast = dial.coast;
  if (coast) {
    coast.time = Math.min(coast.duration, coast.time + dt);
    const t = coast.time;
    const dir = Math.sign(coast.speed);
    dial.pose = coast.from + coast.speed * t - dir * 0.5 * coast.decel * t * t;
    dial.velocity = coast.speed - dir * coast.decel * t;
    if (t >= coast.duration) {
      dial.pose = dial.target;
      dial.velocity = 0;
      dial.coast = null;
    }
    return true;
  }
  const omega = (2 * Math.PI) / dial.response;
  const accel = -omega * omega * (dial.pose - dial.target) - 2 * omega * dial.velocity;
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
