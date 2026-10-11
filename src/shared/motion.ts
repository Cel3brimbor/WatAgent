//apple-style motion primitives: springs in (damping, response) terms, momentum projection, rubber-banding

export type SpringOptions = {
  from: number;
  to: number;
  //px/s at t=0, handed off from the gesture so there's no seam between drag and animation
  velocity?: number;
  //1 = critically damped (no overshoot), <1 = bouncy
  damping?: number;
  //seconds to (roughly) reach the target, not a fixed duration
  response?: number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
};

export type SpringHandle = {
  //stops in place and reports the live value/velocity so the next motion can start from it
  stop: () => { value: number; velocity: number };
};

const STEP_S = 1 / 240;
const REST_DELTA = 0.5;
const REST_SPEED = 8;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function animateSpring({
  from,
  to,
  velocity = 0,
  damping = 1,
  response = 0.4,
  onUpdate,
  onComplete,
}: SpringOptions): SpringHandle {
  let value = from;
  let speed = velocity;
  let frame = 0;
  let last = 0;
  let done = false;

  //reduced motion: skip the travel, land on the target
  if (prefersReducedMotion() || from === to) {
    onUpdate(to);
    onComplete?.();
    return { stop: () => ({ value: to, velocity: 0 }) };
  }

  const omega = (2 * Math.PI) / Math.max(0.05, response);
  const stiffness = omega * omega;
  const friction = 2 * damping * omega;

  function tick(now: number) {
    if (done) return;
    //clamp long frames (tab switch) so the integrator can't explode
    const elapsed = last ? Math.min(0.064, (now - last) / 1000) : 1 / 60;
    last = now;
    for (let t = 0; t < elapsed; t += STEP_S) {
      const h = Math.min(STEP_S, elapsed - t);
      const accel = -stiffness * (value - to) - friction * speed;
      speed += accel * h;
      value += speed * h;
    }
    if (Math.abs(value - to) < REST_DELTA && Math.abs(speed) < REST_SPEED) {
      done = true;
      onUpdate(to);
      onComplete?.();
      return;
    }
    onUpdate(value);
    frame = requestAnimationFrame(tick);
  }

  frame = requestAnimationFrame(tick);
  return {
    stop: () => {
      done = true;
      cancelAnimationFrame(frame);
      return { value, velocity: speed };
    },
  };
}

//apple's scroll-deceleration projection: where a flick would come to rest
export function project(velocityPxPerS: number, decelerationRate = 0.998): number {
  return ((velocityPxPerS / 1000) * decelerationRate) / (1 - decelerationRate);
}

//progressive resistance past a boundary instead of a hard stop
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  const sign = Math.sign(overshoot);
  const distance = Math.abs(overshoot);
  return (sign * (distance * dimension * constant)) / (dimension + constant * distance);
}

export type VelocityTracker = {
  add: (position: number, time?: number) => void;
  //px/s over the last ~100ms of movement
  velocity: () => number;
  reset: () => void;
};

export function createVelocityTracker(windowMs = 100): VelocityTracker {
  let samples: Array<{ p: number; t: number }> = [];
  return {
    add(position, time = performance.now()) {
      samples.push({ p: position, t: time });
      const cutoff = time - windowMs;
      while (samples.length > 2 && samples[0].t < cutoff) samples.shift();
    },
    velocity() {
      if (samples.length < 2) return 0;
      const first = samples[0];
      const latest = samples[samples.length - 1];
      //a pause before release means the finger stopped, not that it's still moving
      if (performance.now() - latest.t > windowMs) return 0;
      const dt = latest.t - first.t;
      return dt > 0 ? ((latest.p - first.p) / dt) * 1000 : 0;
    },
    reset() {
      samples = [];
    },
  };
}
