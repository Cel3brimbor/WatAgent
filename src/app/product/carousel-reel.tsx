"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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

//apple's exponential projection, in pixels of travel from a release velocity
function project(velocityPx: number, deceleration = 0.998): number {
  return (velocityPx / 1000) * deceleration / (1 - deceleration);
}

function rubberband(overshoot: number, dimension = 1, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function springStep(value: number, velocity: number, target: number, dt: number, response: number, dampingRatio: number) {
  const omega = (2 * Math.PI) / response;
  const accel = -omega * omega * (value - target) - 2 * dampingRatio * omega * velocity;
  const nextVelocity = velocity + accel * dt;
  return { value: value + nextVelocity * dt, velocity: nextVelocity };
}

function placement(index: number, position: number, stride: number) {
  const delta = index - position;
  const abs = Math.abs(delta);
  return {
    x: delta * stride,
    z: -abs * 110,
    rot: delta * 34,
    opacity: abs > 2.4 ? 0 : 1 - abs * 0.28,
    scale: 1 - Math.min(0.14, abs * 0.06),
  };
}

export function CarouselReel<T extends string>({ items, active, onActive, renderBody, hint, ariaLabel = "Carousel" }: Props<T>) {
  const count = items.length;
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
  const stride = useRef(300);
  const frame = useRef(0);
  const running = useRef(false);
  const lastTick = useRef(0);
  const [visual, setVisual] = useState(0);
  const [motionOff, setMotionOff] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  function indexOf(id: T): number {
    return Math.max(0, items.findIndex((item) => item.id === id));
  }

  function wake() {
    if (running.current) return;
    running.current = true;
    lastTick.current = performance.now();
    const tick = (now: number) => {
      if (!running.current) return;
      const dt = Math.min(0.032, (now - lastTick.current) / 1000);
      lastTick.current = now;
      if (!dragging.current && !reduced.current) {
        const next = springStep(pose.current, velocity.current, target.current, dt, response.current, damping.current);
        pose.current = next.value;
        velocity.current = next.velocity;
        if (Math.abs(pose.current - target.current) < 0.001 && Math.abs(velocity.current) < 0.01) {
          pose.current = target.current;
          velocity.current = 0;
          running.current = false;
        }
      } else if (!dragging.current) {
        pose.current = target.current;
        velocity.current = 0;
        running.current = false;
      }
      if (!Number.isFinite(pose.current) || !Number.isFinite(velocity.current)) {
        pose.current = target.current;
        velocity.current = 0;
        running.current = false;
      }
      setVisual(pose.current);
      if (running.current) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  function go(id: T, flicked: boolean) {
    const next = indexOf(id);
    target.current = next;
    response.current = flicked ? 0.4 : 0.36;
    damping.current = flicked ? 0.82 : 1;
    if (!flicked) velocity.current = 0;
    if (reduced.current) {
      pose.current = next;
      velocity.current = 0;
      setVisual(next);
    } else {
      wake();
    }
    if (id !== active) onActive(id);
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
    const measure = () => {
      stride.current = Math.min(340, Math.max(210, node.clientWidth * 0.62));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    const next = indexOf(active);
    if (!fromGesture.current) {
      damping.current = 1;
      response.current = 0.4;
      velocity.current = 0;
    }
    fromGesture.current = false;
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
      const step = startX - endX > 24 ? 1 : endX - startX > 24 ? -1 : 0;
      const next = clamp(Math.round(origin) + step, 0, count - 1);
      fromGesture.current = true;
      go(items[next].id, false);
      return;
    }
    const span = stride.current;
    const projected = pose.current + project(-releaseVx) / span;
    const base = Math.round(pose.current);
    const landed = clamp(Math.round(projected), Math.max(0, base - 1), Math.min(count - 1, base + 1));
    const raw = -releaseVx / span;
    const distance = landed - pose.current;
    velocity.current = Math.sign(raw) * Math.min(Math.abs(raw), Math.max(0.8, Math.abs(distance) * 3));
    fromGesture.current = true;
    go(items[landed].id, true);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = pose.current;
    const pointerId = event.pointerId;
    const stage = event.currentTarget;
    let lastX = startX;
    let lastT = performance.now();
    let vx = 0;
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
      const span = stride.current;
      let next = origin - dx / span;
      if (next < 0) next = rubberband(next);
      else if (next > count - 1) next = count - 1 + rubberband(next - (count - 1));
      pose.current = next;
      const now = performance.now();
      const dt = now - lastT;
      if (dt > 0) vx = ((ev.clientX - lastX) / dt) * 1000;
      lastX = ev.clientX;
      lastT = now;
      setVisual(next);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      finishDrag(moved, origin, startX, ev.clientX, vx);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  const activeIndex = indexOf(active);
  const title = items[activeIndex]?.title ?? "";

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
        {items.map((item, index) => {
          const place = placement(index, motionOff ? activeIndex : visual, stride.current);
          const depth = Math.abs(index - (motionOff ? activeIndex : visual));
          const front = item.id === active && depth < 0.45;
          const style = {
            transform: motionOff
              ? undefined
              : `translate(-50%, -50%) translate3d(${place.x}px, 0, ${place.z}px) rotateY(${place.rot}deg) scale(${place.scale})`,
            opacity: motionOff ? undefined : place.opacity,
            zIndex: 10 - Math.round(depth * 2),
            pointerEvents: !motionOff && depth > 1.2 ? "none" : undefined,
          } as CSSProperties;
          return (
            <article
              key={item.id}
              className={styles.reelCard}
              data-front={front}
              data-hidden={motionOff && item.id !== active}
              style={style}
            >
              {item.id !== active ? (
                <button type="button" className={styles.cardPick} aria-label={`Show ${item.title}`} onClick={() => go(item.id, false)} />
              ) : null}
              <header className={styles.cardHead}>
                <span>{item.kicker}</span>
                <h3>{item.title}</h3>
              </header>
              <div className={styles.cardBody} inert={item.id !== active}>
                {renderBody(item.id)}
              </div>
            </article>
          );
        })}
      </div>
      <div className={styles.reelControls}>
        <button type="button" className={styles.reelStep} aria-label="Previous" disabled={activeIndex === 0} onClick={() => go(items[activeIndex - 1].id, false)}>←</button>
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
        <button type="button" className={styles.reelStep} aria-label="Next" disabled={activeIndex === count - 1} onClick={() => go(items[activeIndex + 1].id, false)}>→</button>
      </div>
      {hint ? <p className={styles.reelHint}>{hint}</p> : null}
    </div>
  );
}
