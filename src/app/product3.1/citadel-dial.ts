import { wrap } from "./citadel-math";

//rolling friction on a released reel, in frames/s². a hard flick (~5 frames/s) coasts ~5 frames over ~2s.
const FRICTION = 2.4;
//below this the release is a placement, not a throw: just settle on the nearest frame
const THROW = 0.3;
//the hardest throw the reel takes, in frames/s: ~10 frames over ~2.9s
const MAX_SPEED = 7;
//a step from the buttons or keys: a slow, critically damped glide that keeps any speed already on the reel
const GLIDE = 0.62;
//the spring chases a lead that eases toward the target, so a step starts gently instead of with a kick
const LEAD = 0.12;

//the reel's roll, in frames. pose stays unwrapped so turning past the last item keeps going the same way.
//the scene integrates it every frame; pointer handlers and buttons only move the target.
export type Dial = {
  frames: number;
  items: number;
  pose: number;
  target: number;
  lead: number;
  velocity: number;
  response: number;
  dragging: boolean;
  //a throw in flight: constant deceleration from `from` that comes to rest exactly on `target`
  coast: { from: number; speed: number; decel: number; time: number; duration: number } | null;
  //on-screen width of the front frame, so a drag of one frame width turns one frame
  framePx: number;
  //where the reel is headed (dots follow this) and where it came to rest (the live card follows this)
  onSettle: ((item: number) => void) | null;
  onArrive: ((item: number) => void) | null;
  lastItem: number;
  moving: boolean;
};

export function createDial(frames: number, items: number): Dial {
  return {
    frames,
    items,
    pose: 0,
    target: 0,
    lead: 0,
    velocity: 0,
    response: 0.34,
    dragging: false,
    coast: null,
    framePx: 360,
    onSettle: null,
    onArrive: null,
    lastItem: 0,
    moving: false,
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

//critically damped spring onto a frame: buttons, dots, keys, and placements.
//velocity carries over, so a second click mid-turn bends the motion instead of restarting it.
function aim(dial: Dial, target: number, response = GLIDE) {
  dial.coast = null;
  dial.target = target;
  dial.response = response;
  dial.moving = true;
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
  dial.moving = true;
}

//let go at `release` frames/s. the reel keeps the hand's speed and slows under constant friction, so a faster
//throw goes further and takes longer. it always comes to rest on a slide: the stop is rounded onto one, never
//short of the next slide in the direction of travel, and the friction is re-solved so it lands there exactly.
export function dialRelease(dial: Dial, release: number) {
  dial.dragging = false;
  const speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, release));
  if (Math.abs(speed) < THROW) {
    aim(dial, Math.round(dial.pose), 0.4);
    return;
  }
  const dir = Math.sign(speed);
  const reach = Math.round(dial.pose + (speed * Math.abs(speed)) / (2 * FRICTION));
  const landed = dir > 0 ? Math.max(Math.ceil(dial.pose + 0.2), reach) : Math.min(Math.floor(dial.pose - 0.2), reach);
  const distance = Math.abs(landed - dial.pose);
  //keep the hand's speed unless the friction that fits would feel wrong; then start a touch faster or slower
  const decel = Math.min(FRICTION * 3, Math.max(FRICTION * 0.5, (speed * speed) / (2 * distance)));
  const v = dir * Math.sqrt(2 * decel * distance);
  dial.coast = { from: dial.pose, speed: v, decel, time: 0, duration: Math.abs(v) / decel };
  dial.target = landed;
  dial.velocity = v;
  dial.moving = true;
  announce(dial);
}

function arrive(dial: Dial) {
  if (!dial.moving) return;
  dial.moving = false;
  dial.onArrive?.(itemAt(dial, dial.pose));
}

//true while still moving
export function stepDial(dial: Dial, dt: number): boolean {
  if (dial.dragging) {
    dial.lead = dial.pose;
    return true;
  }
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
      arrive(dial);
    }
    dial.lead = dial.pose;
    return true;
  }
  const omega = (2 * Math.PI) / dial.response;
  dial.lead += (dial.target - dial.lead) * (1 - Math.exp(-dt / LEAD));
  const accel = -omega * omega * (dial.pose - dial.lead) - 2 * omega * dial.velocity;
  dial.velocity += accel * dt;
  dial.pose += dial.velocity * dt;
  if (!Number.isFinite(dial.pose) || !Number.isFinite(dial.velocity)) {
    dial.pose = dial.target;
    dial.velocity = 0;
  }
  //close enough to read: the live card can take over while the spring finishes its last hair
  if (Math.abs(dial.pose - dial.target) < 0.02 && Math.abs(dial.velocity) < 0.15) arrive(dial);
  if (Math.abs(dial.pose - dial.target) < 0.0005 && Math.abs(dial.velocity) < 0.005) {
    dial.pose = dial.target;
    dial.lead = dial.target;
    dial.velocity = 0;
    //fold far-travelled poses back so floats stay small; whole multiples of the frame count look identical
    if (Math.abs(dial.pose) > dial.frames * 8) {
      const folded = wrap(dial.pose, dial.frames);
      dial.pose = folded;
      dial.target = folded;
      dial.lead = folded;
    }
    arrive(dial);
    return false;
  }
  return true;
}
