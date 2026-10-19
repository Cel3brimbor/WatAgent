"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createVelocityTracker, project } from "@/shared/motion";
import styles from "./product.module.css";

export type CarouselItem<T extends string> = {
  id: T;
  title: string;
  kicker: string;
};

type Props<T extends string> = {
  items: readonly CarouselItem<T>[];
  active: T;
  onActive: (id: T) => void;
  renderBody: (id: T) => ReactNode;
  hint?: string;
  ariaLabel?: string;
};

function wrap(value: number, count: number): number {
  return ((value % count) + count) % count;
}

//shortest signed steps from a (possibly unwrapped) pose onto a card index
function nearestTarget(pose: number, index: number, count: number): number {
  const delta = wrap(index - pose, count);
  return pose + (delta > count / 2 ? delta - count : delta);
}

function wrapDelta(index: number, position: number, count: number): number {
  return index - position - count * Math.round((index - position) / count);
}

function springStep(value: number, velocity: number, target: number, dt: number, response: number, dampingRatio: number) {
  const omega = (2 * Math.PI) / response;
  const accel = -omega * omega * (value - target) - 2 * dampingRatio * omega * velocity;
  const nextVelocity = velocity + accel * dt;
  return { value: value + nextVelocity * dt, velocity: nextVelocity };
}

function radiusFor(width: number, count: number): number {
  const cardW = Math.min(420, width * 0.74);
  const step = (2 * Math.PI) / Math.max(count, 2);
  const fit = (cardW * 0.52) / Math.tan(step / 2);
  return Math.max(190, Math.min(fit, width * 0.48, 520));
}

export function CarouselReel<T extends string>({ items, active, onActive, renderBody, hint, ariaLabel = "Carousel" }: Props<T>) {
  const count = items.length;
  const stepDeg = 360 / Math.max(count, 1);
  const stageRef = useRef<HTMLDivElement>(null);
  const pose = useRef(0);
  const velocity = useRef(0);
  const target = useRef(0);
  const response = useRef(0.4);
  const damping = useRef(1);
  const dragging = useRef(false);
  const fromGesture = useRef(false);
  const suppressClick = useRef(false);
  const reduced = useRef(false);
  const frame = useRef(0);
  const running = useRef(false);
  const lastTick = useRef(0);
  const [visual, setVisual] = useState(0);
  const [radius, setRadius] = useState(280);
  const [motionOff, setMotionOff] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  function indexOf(id: T): number {
    return Math.max(0, items.findIndex((item) => item.id === id));
  }

  function idAt(value: number): T {
    return items[wrap(Math.round(value), count)].id;
  }

  function arc(): number {
    return Math.max(160, radius * ((Math.PI * 2) / Math.max(count, 2)));
  }

  function settlePose() {
    pose.current = target.current;
    velocity.current = 0;
    running.current = false;
    frame.current = 0;
    //keep pose unwrapped so a turn past the last card stays  n → n+1, not a jump to 0
    if (Math.abs(pose.current) > count * 8) {
      const folded = wrap(pose.current, count);
      pose.current = folded;
      target.current = folded;
    }
    setVisual(pose.current);
  }

  const tickRef = useRef<(now: number) => void>(() => {});
  tickRef.current = (now: number) => {
    if (!running.current) {
      frame.current = 0;
      return;
    }
    const dt = Math.min(0.032, (now - lastTick.current) / 1000);
    lastTick.current = now;
    if (!dragging.current && !reduced.current) {
      const next = springStep(pose.current, velocity.current, target.current, dt, response.current, damping.current);
      pose.current = next.value;
      velocity.current = next.velocity;
      if (Math.abs(pose.current - target.current) < 0.001 && Math.abs(velocity.current) < 0.01) {
        settlePose();
        return;
      }
    } else if (!dragging.current) {
      settlePose();
      return;
    }
    if (!Number.isFinite(pose.current) || !Number.isFinite(velocity.current)) {
      settlePose();
      return;
    }
    setVisual(pose.current);
    frame.current = requestAnimationFrame((t) => tickRef.current(t));
  };

  function wake() {
    running.current = true;
    lastTick.current = performance.now();
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame((t) => tickRef.current(t));
  }

  function goToPose(nextPose: number, flicked: boolean) {
    target.current = nextPose;
    response.current = flicked ? 0.4 : 0.3;
    damping.current = flicked ? 0.8 : 1;
    if (!flicked) velocity.current = 0;
    const id = idAt(nextPose);
    if (reduced.current) {
      pose.current = nextPose;
      velocity.current = 0;
      running.current = false;
      frame.current = 0;
      setVisual(nextPose);
    } else {
      wake();
    }
    if (id !== active) {
      fromGesture.current = true;
      onActive(id);
    }
  }

  function go(id: T, flicked: boolean) {
    goToPose(nearestTarget(pose.current, indexOf(id), count), flicked);
  }

  function step(dir: number) {
    goToPose(Math.round(target.current) + dir, false);
  }

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reduced.current = query.matches;
      setMotionOff(query.matches);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const measure = () => setRadius(radiusFor(node.clientWidth, count));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [count]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const stop = (event: MouseEvent) => {
      if (!suppressClick.current) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    node.addEventListener("click", stop, true);
    return () => node.removeEventListener("click", stop, true);
  }, []);

  const wakeRef = useRef(wake);
  wakeRef.current = wake;

  useEffect(() => {
    if (dragging.current) return;
    //go() already aimed the spring at this card — don't retarget and kill velocity
    if (fromGesture.current) {
      fromGesture.current = false;
      return;
    }
    const next = nearestTarget(pose.current, indexOf(active), count);
    damping.current = 1;
    response.current = 0.4;
    velocity.current = 0;
    target.current = next;
    if (reduced.current) {
      pose.current = next;
      setVisual(next);
      return;
    }
    wakeRef.current();
  }, [active]);

  useEffect(() => {
    return () => {
      running.current = false;
      cancelAnimationFrame(frame.current);
    };
  }, []);

  function finishDrag(moved: boolean, origin: number, startX: number, endX: number, releaseVx: number) {
    dragging.current = false;
    setGrabbing(false);
    if (!moved) return;
    suppressClick.current = true;
    if (reduced.current) {
      const dir = startX - endX > 24 ? 1 : endX - startX > 24 ? -1 : 0;
      goToPose(Math.round(origin) + dir, false);
      return;
    }
    const span = arc();
    const projected = pose.current + project(-releaseVx) / span;
    const landed = Math.round(projected);
    const distance = landed - pose.current;
    const raw = -releaseVx / span;
    velocity.current = Math.sign(raw) * Math.min(Math.abs(raw), Math.max(0.8, Math.abs(distance) * 3));
    goToPose(landed, true);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = pose.current;
    const pointerId = event.pointerId;
    const stage = event.currentTarget;
    const tracker = createVelocityTracker();
    tracker.add(startX);
    let moved = false;
    dragging.current = true;

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved) {
        if (Math.hypot(dx, dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          dragging.current = false;
          return;
        }
        moved = true;
        setGrabbing(true);
        try {
          stage.setPointerCapture(pointerId);
        } catch {
          //the pointer can already be gone
        }
      }
      const next = origin - dx / arc();
      pose.current = next;
      tracker.add(ev.clientX);
      setVisual(next);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      finishDrag(moved, origin, startX, ev.clientX, tracker.velocity());
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const activeIndex = indexOf(active);
  const title = items[activeIndex]?.title ?? "";
  const spin = -visual * stepDeg;

  return (
    <div className={styles.reel}>
      <p className={styles.srOnly} aria-live="polite">{title}</p>
      <div
        ref={stageRef}
        className={styles.reelStage}
        data-dragging={grabbing}
        data-reduced={motionOff}
        onPointerDown={onPointerDown}
      >
        <div
          className={styles.reelRing}
          style={
            motionOff
              ? undefined
              : ({
                  transform: `rotateX(5deg) translateZ(${-radius}px) rotateY(${spin}deg)`,
                } as CSSProperties)
          }
        >
          {items.map((item, index) => {
            const delta = wrapDelta(index, motionOff ? activeIndex : visual, count);
            const depth = Math.abs(delta);
            const facing = Math.cos((delta * Math.PI * 2) / Math.max(count, 1));
            const front = depth < 0.45;
            const behind = !motionOff && facing < -0.08;
            const yaw = index * stepDeg;
            //turn the face a little toward the camera so the edge doesn't staircase
            const face = motionOff ? 0 : -delta * stepDeg * 0.28;
            const style = {
              transform: motionOff ? undefined : `rotateY(${yaw}deg) translateZ(${radius}px) rotateY(${face}deg)`,
              zIndex: 10 + Math.round(facing * 10),
              pointerEvents: !motionOff && depth > 1.25 ? "none" : undefined,
              visibility: behind ? "hidden" : undefined,
              ["--shade" as string]: front ? 0 : Math.max(0, 1 - Math.max(0, facing)),
            } as CSSProperties;
            return (
              <article
                key={item.id}
                className={styles.reelCard}
                data-front={front}
                data-hidden={motionOff && item.id !== active}
                style={style}
              >
                <div className={styles.reelCardFace}>
                  {!front ? (
                    <button type="button" className={styles.cardPick} aria-label={`Show ${item.title}`} onClick={() => go(item.id, false)} />
                  ) : null}
                  <header className={styles.cardHead}>
                    <span>{item.kicker}</span>
                    <h3>{item.title}</h3>
                  </header>
                  <div className={styles.cardBody} inert={!front}>
                    {renderBody(item.id)}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
      <div className={styles.reelControls}>
        <button type="button" className={styles.reelStep} aria-label="Previous" onClick={() => step(-1)}>←</button>
        <div role="radiogroup" aria-label={ariaLabel} className={styles.reelDots}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={item.id === active}
              aria-label={item.title}
              className={styles.reelDot}
              onClick={() => go(item.id, false)}
            />
          ))}
        </div>
        <button type="button" className={styles.reelStep} aria-label="Next" onClick={() => step(1)}>→</button>
      </div>
      {hint ? <p className={styles.reelHint}>{hint}</p> : null}
    </div>
  );
}
