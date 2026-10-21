"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import { DemoThread, scenarioOf } from "./agent-reel";
import { CELL_W, filmItems, type Prints } from "./citadel-film";
import { FEATURES, FeatureBody, type FeatureId } from "./feature-reel";
import { CalendarPreview } from "./preview";
import type { AgentScenarioId } from "./product-demo-conversations";
import type { ReelId } from "./citadel-math";
import type { StageDom } from "./citadel-rig";
import productStyles from "./product.module.css";
import styles from "./citadel.module.css";

//the calendar behind the sphere's iris. the scene sizes the iris and flies it out to fill the stage.
export function LensView({
  dom,
  live,
  onFeature,
  onAskAgent,
}: {
  dom: StageDom;
  live: boolean;
  onFeature: (id: FeatureId) => void;
  onAskAgent: () => void;
}) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  //transforms don't change offset sizes, so this is the calendar's own box
  useEffect(() => {
    if (!node) return;
    const measure = () => {
      dom.lensSize = { w: node.offsetWidth || 1, h: node.offsetHeight || 1 };
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, dom]);

  return (
    <div
      ref={(next) => {
        dom.lens = next;
        setNode(next);
      }}
      className={styles.lens}
      inert={!live}
    >
      <CalendarPreview onFeature={onFeature} onAskAgent={onAskAgent} />
      <div ref={(next) => void (dom.shade = next)} className={styles.lensShade} aria-hidden="true">
        {!live ? <SphereSlides /> : null}
      </div>
    </div>
  );
}

//the mini slideshow inside the sphere: one feature at a time while the bands turn
function SphereSlides() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % FEATURES.length), 2400);
    return () => window.clearInterval(timer);
  }, []);
  const feature = FEATURES[index];
  return (
    <div className={styles.sphereSlide} key={feature.id}>
      <span>{String(index + 1).padStart(2, "0")} / {String(FEATURES.length).padStart(2, "0")}</span>
      <strong>{feature.title}</strong>
      <em>{feature.kicker}</em>
    </div>
  );
}

//the face of one card. the live reel and the photographs on the band both render exactly this.
function CardFace({ reel, index, front, onAskAgent }: { reel: ReelId; index: number; front: boolean; onAskAgent: () => void }) {
  const item = filmItems(reel)[index];
  return (
    <>
      <header className={productStyles.cardHead}>
        <span>{item.kicker}</span>
        <h3>{item.title}</h3>
      </header>
      <div className={productStyles.cardBody}>
        {reel === "features" ? (
          <FeatureBody id={item.id as FeatureId} />
        ) : (
          <div className={productStyles.agentCardBody}>
            {/* a new card streams its turn from the top every time it comes round */}
            <DemoThread messages={scenarioOf(item.id as AgentScenarioId).messages} playing={front} visible />
            <button type="button" className={productStyles.ask} onClick={onAskAgent}>Ask with your own week</button>
          </div>
        )}
      </div>
    </>
  );
}

//one live card per item, glued by the scene onto the drum face nearest the front that shows it
export function ReelLayer({
  reel,
  dom,
  active,
  live,
  onAskAgent,
}: {
  reel: ReelId;
  dom: StageDom;
  active: number;
  live: boolean;
  onAskAgent: () => void;
}) {
  const items = filmItems(reel);
  return (
    <div
      ref={(next) => void (dom.layers[reel] = next)}
      className={styles.reelLayer}
      style={{ display: "none" }}
      aria-hidden={!live}
    >
      {items.map((item, index) => {
        const front = live && index === active;
        return (
          <article
            key={item.id}
            ref={(next) => void (dom.cards[reel][index] = next)}
            className={`${styles.cardFace} ${styles.reelCard}`}
            data-front={front || undefined}
            inert={!front}
          >
            <CardFace reel={reel} index={index} front={front} onAskAgent={onAskAgent} />
          </article>
        );
      })}
    </div>
  );
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 16);
  });

//the variable fonts ship a face per script; every print would decode all of them. the cards are latin.
function latinFaces(css: string): string {
  return css
    .split(/(?=@font-face)/)
    //the CSSOM serialises U+0000-00FF as U+0-FF
    .filter((face) => !/unicode-range/i.test(face) || /U\+0{1,4}-0{0,2}FF\b/i.test(face))
    .join("");
}

//photographs every card at the live card's size, off screen, so the prints on the band are the real thing.
//runs once per front-frame size and hands the scene one batch per reel.
export function FilmPrints({ dom, width, height, onDone }: { dom: StageDom; width: number; height: number; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { toCanvas, getFontEmbedCSS } = await import("html-to-image");
      await document.fonts.ready;
      await nextFrame();
      await nextFrame();
      const host = root.current;
      if (!host || cancelled) return;
      const nodes = Array.from(host.querySelectorAll<HTMLElement>("[data-print]"));
      let fontEmbedCSS: string | undefined;
      try {
        fontEmbedCSS = latinFaces(await getFontEmbedCSS(nodes[0]));
      } catch {
        //system fonts in the print are better than no print
      }
      for (const reel of ["features", "agents"] as const) {
        const prints: Prints = [];
        for (const node of nodes.filter((item) => item.dataset.print === reel)) {
          await idle();
          if (cancelled) return;
          try {
            prints[Number(node.dataset.index)] = await toCanvas(node, {
              width,
              height,
              pixelRatio: CELL_W / width,
              fontEmbedCSS,
              cacheBust: false,
            });
          } catch {
            prints[Number(node.dataset.index)] = null;
          }
        }
        if (cancelled) return;
        dom.prints[reel] = prints;
        dom.printVersion[reel] += 1;
      }
      done.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [dom, width, height]);

  return (
    <div ref={root} className={styles.printRoom} aria-hidden="true" inert>
      {(["features", "agents"] as const).map((reel) =>
        filmItems(reel).map((item, index) => (
          <article
            key={`${reel}-${item.id}`}
            data-print={reel}
            data-index={index}
            className={styles.cardFace}
            style={{ width, height }}
          >
            <CardFace reel={reel} index={index} front={false} onAskAgent={() => {}} />
          </article>
        )),
      )}
    </div>
  );
}

export function ReelControls({
  reel,
  active,
  rootRef,
  onStep,
  onPick,
}: {
  reel: ReelId;
  active: number;
  rootRef: Ref<HTMLDivElement>;
  onStep: (dir: number) => void;
  onPick: (index: number) => void;
}) {
  const items = filmItems(reel);
  const label = reel === "features" ? "Calendar features" : "Assistant examples";
  return (
    <div ref={rootRef} className={styles.reelControls} data-reel={reel}>
      <p className={productStyles.srOnly} aria-live="polite">{items[active]?.title}</p>
      <div className={styles.reelButtons}>
        <button type="button" className={productStyles.reelStep} aria-label="Previous" onClick={() => onStep(-1)}>←</button>
        <div role="radiogroup" aria-label={label} className={productStyles.reelDots}>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={index === active}
              aria-label={item.title}
              className={productStyles.reelDot}
              onClick={() => onPick(index)}
            />
          ))}
        </div>
        <button type="button" className={productStyles.reelStep} aria-label="Next" onClick={() => onStep(1)}>→</button>
      </div>
      <p className={styles.reelHint}>
        {reel === "features" ? "Drag the band to turn it. It loops." : "Turn the band. Each new turn streams in."}
      </p>
    </div>
  );
}
