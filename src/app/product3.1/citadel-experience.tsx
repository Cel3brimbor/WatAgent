"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { createVelocityTracker, project } from "@/shared/motion";
import { AgentReel } from "./agent-reel";
import { dialRelease, dialStep, dialTo } from "./citadel-dial";
import { setPageLenis } from "./citadel-lenis";
import { BEATS, holdFraction, phaseAt, type Phase, type ReelId } from "./citadel-math";
import { createDials, createRig, createStageDom } from "./citadel-rig";
import { LensView, ReelControls, ReelLayer } from "./citadel-stage";
import { ExploreDialog } from "./explore-dialog";
import { FEATURES, FeatureReel, type FeatureId } from "./feature-reel";
import { CalendarPreview } from "./preview";
import { ProductScrollLink, scrollToTarget } from "./product-scroll-link";
import productStyles from "./product.module.css";
import styles from "./citadel.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

//webgl is client only and loads after the copy has painted
const CitadelScene = dynamic(() => import("./citadel-scene"), { ssr: false });

type Motion = "pending" | "full" | "reduced";

type Span = readonly [number, number];
const at = ([start, end]: Span) => ({ position: start, duration: end - start });

const ANCHORS: { id: string; span: Span }[] = [
  { id: "preview", span: BEATS.calendarHold },
  { id: "showcase", span: BEATS.featuresHold },
  { id: "assistant", span: BEATS.agentsHold },
];

export function CitadelExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const captionRefs = useRef<Record<"calendar" | ReelId, HTMLDivElement | null>>({ calendar: null, features: null, agents: null });
  const controlRefs = useRef<Record<ReelId, HTMLDivElement | null>>({ features: null, agents: null });
  const rig = useRef(createRig());
  const dom = useMemo(createStageDom, []);
  const dials = useMemo(createDials, []);
  const [motion, setMotion] = useState<Motion>("pending");
  //one-way bridge out of the timeline: which view owns input right now
  const [phase, setPhase] = useState<Phase>("orbit");
  const phaseRef = useRef<Phase>("orbit");
  const [active, setActive] = useState<Record<ReelId, number>>({ features: 0, agents: 0 });
  const [ask, setAsk] = useState(false);

  function enter(next: Phase) {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
  }

  //the dial reports where it will land; dots and the live card follow that, not every frame of the turn
  useEffect(() => {
    for (const reel of Object.keys(dials) as ReelId[]) {
      dials[reel].onSettle = (item) => setActive((current) => (current[reel] === item ? current : { ...current, [reel]: item }));
    }
    return () => {
      for (const reel of Object.keys(dials) as ReelId[]) dials[reel].onSettle = null;
    };
  }, [dials]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" },
        (context) => {
          if (context.conditions?.reduced) {
            //no canvas, no pin, no lenis: the plain page in document flow
            setMotion("reduced");
            return;
          }
          setMotion("full");
          enter("orbit");

          const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, autoRaf: false });
          setPageLenis(lenis);
          lenis.on("scroll", ScrollTrigger.update);
          const tick = (time: number) => lenis.raf(time * 1000);
          gsap.ticker.add(tick);
          gsap.ticker.lagSmoothing(0);

          const r = rig.current;
          Object.assign(r, createRig());
          const captions = captionRefs.current;
          const controls = controlRefs.current;
          const show = { autoAlpha: 1, y: 0, ease: "power2.out", duration: 0.3 };
          const hide = { autoAlpha: 0, y: -12, ease: "power1.in", duration: 0.25 };
          gsap.set([captions.calendar, captions.features, captions.agents, controls.features, controls.agents], { autoAlpha: 0, y: 12 });

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              id: "citadel",
              trigger: trackRef.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
            onUpdate: () => enter(phaseAt(tl.time())),
          });

          tl.to(heroRef.current, { autoAlpha: 0, y: -48, ease: "power1.in", ...dur(BEATS.hero) }, BEATS.hero[0])
            .to(r, { center: 1, ease: "power2.inOut", ...dur(BEATS.center) }, BEATS.center[0])
            //calendar out of the sphere, a beat to use it, then back in
            .to(r, { lens: 1, ease: "power2.inOut", ...dur(BEATS.lensOpen) }, BEATS.lensOpen[0])
            .to(captions.calendar, show, BEATS.lensOpen[1] - 0.3)
            .to(captions.calendar, hide, BEATS.lensClose[0])
            .to(r, { lens: 0, ease: "power2.inOut", ...dur(BEATS.lensClose) }, BEATS.lensClose[0])
            //the feature band lifts off and opens into a reel
            .to(r, { features: 1, ease: "power2.inOut", ...dur(BEATS.featuresOpen) }, BEATS.featuresOpen[0])
            .to([captions.features, controls.features], show, BEATS.featuresOpen[1] - 0.3)
            .to([captions.features, controls.features], hide, BEATS.featuresClose[0])
            .to(r, { features: 0, ease: "power2.inOut", ...dur(BEATS.featuresClose) }, BEATS.featuresClose[0])
            //then the assistant band
            .to(r, { agents: 1, ease: "power2.inOut", ...dur(BEATS.agentsOpen) }, BEATS.agentsOpen[0])
            .to([captions.agents, controls.agents], show, BEATS.agentsOpen[1] - 0.3)
            .to([captions.agents, controls.agents], hide, BEATS.agentsClose[0])
            .to(r, { agents: 0, ease: "power2.inOut", ...dur(BEATS.agentsClose) }, BEATS.agentsClose[0])
            .to(r, { exit: 1, ease: "power1.in", ...dur(BEATS.exit) }, BEATS.exit[0])
            .set({}, {}, BEATS.end);

          void document.fonts.ready.then(() => ScrollTrigger.refresh());

          return () => {
            gsap.ticker.remove(tick);
            gsap.ticker.lagSmoothing(500, 33);
            lenis.destroy();
            setPageLenis(null);
          };
        },
      );
    },
    { scope: rootRef },
  );

  //drag the open band. horizontal intent turns it; vertical intent is left to the page scroll.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let suppress = false;
    const reelNow = (): ReelId | null => (phaseRef.current === "features" || phaseRef.current === "agents" ? phaseRef.current : null);

    const down = (event: PointerEvent) => {
      const reel = reelNow();
      if (!reel || event.button !== 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable], [data-no-drag]")) return;
      const dial = dials[reel];
      const startX = event.clientX;
      const startY = event.clientY;
      const origin = dial.pose;
      const tracker = createVelocityTracker();
      tracker.add(startX);
      let moved = false;

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== event.pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved) {
          if (Math.hypot(dx, dy) < 10) return;
          if (Math.abs(dy) > Math.abs(dx)) {
            stop();
            return;
          }
          moved = true;
          dial.dragging = true;
          stage.dataset.grabbing = "";
          try {
            stage.setPointerCapture(event.pointerId);
          } catch {
            //the pointer can already be gone
          }
        }
        dial.pose = origin - dx / dial.framePx;
        tracker.add(ev.clientX);
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== event.pointerId) return;
        stop();
        if (!moved) return;
        suppress = true;
        const vx = tracker.velocity();
        dialRelease(dial, project(-vx) / dial.framePx, -vx / dial.framePx);
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        delete stage.dataset.grabbing;
        if (!moved) dial.dragging = false;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    //a drag that ends on a button is not a click
    const click = (event: MouseEvent) => {
      if (!suppress) return;
      suppress = false;
      event.preventDefault();
      event.stopPropagation();
    };
    const key = (event: KeyboardEvent) => {
      const reel = reelNow();
      if (!reel || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      dialStep(dials[reel], event.key === "ArrowLeft" ? -1 : 1);
    };
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("click", click, true);
    window.addEventListener("keydown", key);
    return () => {
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("click", click, true);
      window.removeEventListener("keydown", key);
    };
  }, [dials, motion]);

  //a calendar sidebar link turns the feature band to that side and scrolls down to it
  function showFeature(id: FeatureId) {
    const index = FEATURES.findIndex((feature) => feature.id === id);
    if (index >= 0) dialTo(dials.features, index);
    const anchor = document.getElementById("showcase");
    if (anchor) scrollToTarget(anchor);
  }

  if (motion === "reduced") {
    return (
      <div className={styles.root} data-motion="reduced">
        <ReducedPage onAskAgent={() => setAsk(true)} />
        {ask ? <ExploreDialog onClose={() => setAsk(false)} /> : null}
      </div>
    );
  }

  const animated = motion === "full";
  const running = animated && phase !== "done";

  return (
    <div ref={rootRef} className={styles.root} data-motion={motion} data-phase={phase}>
      <div ref={trackRef} className={styles.track}>
        {ANCHORS.map((anchor) => (
          <span key={anchor.id} id={anchor.id} className={styles.anchor} style={{ "--at": holdFraction(anchor.span) } as CSSProperties} />
        ))}
        <section ref={stageRef} className={styles.stage} aria-label="WatAgent">
          <div className={styles.lensLayer} data-off={!animated || phase === "done" || undefined}>
            <LensView dom={dom} live={phase === "calendar"} onFeature={showFeature} onAskAgent={() => setAsk(true)} />
          </div>
          <div className={styles.canvas} data-off={!running || undefined}>
            {animated ? <CitadelScene rig={rig} dom={dom} dials={dials} running={running} /> : null}
          </div>
          {animated ? (
            <>
              <ReelLayer reel="features" dom={dom} active={active.features} live={phase === "features"} onAskAgent={() => setAsk(true)} />
              <ReelLayer reel="agents" dom={dom} active={active.agents} live={phase === "agents"} onAskAgent={() => setAsk(true)} />
            </>
          ) : null}

          <div ref={heroRef} className={styles.hero}>
            <div className={productStyles.eyebrow}><span /> A LITTLE STRUCTURE. A LOT MORE POSSIBILITY.</div>
            <h1>Your days,<br /><em>thoughtfully</em> planned.</h1>
            <p>Bring your calendars together. Talk through your plans. Find a little more space for what matters.</p>
            <div className={styles.actions}>
              <Link className={productStyles.primary} href="/">Start your day with WatAgent <span aria-hidden="true">↗</span></Link>
              <ProductScrollLink className={productStyles.secondary} href="#preview">Explore the calendar <span aria-hidden="true">↓</span></ProductScrollLink>
            </div>
            <div className={styles.scrollCue} aria-hidden="true">SCROLL TO UNFOLD</div>
          </div>

          <div ref={(node) => void (captionRefs.current.calendar = node)} className={styles.caption} data-compact>
            <span className={productStyles.label}>YOUR CALENDAR, WITH AN ASSISTANT</span>
            <span className={styles.captionAside}>A live sample week. Click around.</span>
          </div>
          <div ref={(node) => void (captionRefs.current.features = node)} className={styles.caption}>
            <span className={productStyles.label}>A CLOSER LOOK</span>
            <h2>Turn the band, <em>read a side.</em></h2>
          </div>
          <div ref={(node) => void (captionRefs.current.agents = node)} className={styles.caption}>
            <span className={productStyles.label}>THE ASSISTANT</span>
            <h2>Ask in plain language. <em>Watch it work.</em></h2>
          </div>

          {(["features", "agents"] as const).map((reel) => (
            <ReelControls
              key={reel}
              reel={reel}
              active={active[reel]}
              rootRef={(node) => void (controlRefs.current[reel] = node)}
              onStep={(dir) => dialStep(dials[reel], dir)}
              onPick={(index) => dialTo(dials[reel], index)}
            />
          ))}
        </section>
      </div>
      {ask ? <ExploreDialog onClose={() => setAsk(false)} /> : null}
    </div>
  );
}

function dur(span: Span) {
  return { duration: at(span).duration };
}

//prefers-reduced-motion: the same content laid out flat, no canvas and no pinned runway
function ReducedPage({ onAskAgent }: { onAskAgent: () => void }) {
  const [feature, setFeature] = useState<FeatureId>("tags");
  return (
    <div className={styles.reduced}>
      <div className={styles.hero}>
        <div className={productStyles.eyebrow}><span /> A LITTLE STRUCTURE. A LOT MORE POSSIBILITY.</div>
        <h1>Your days,<br /><em>thoughtfully</em> planned.</h1>
        <p>Bring your calendars together. Talk through your plans. Find a little more space for what matters.</p>
        <div className={styles.actions}>
          <Link className={productStyles.primary} href="/">Start your day with WatAgent <span aria-hidden="true">↗</span></Link>
          <ProductScrollLink className={productStyles.secondary} href="#preview">Explore the calendar <span aria-hidden="true">↓</span></ProductScrollLink>
        </div>
      </div>
      <section id="preview" className={styles.reducedBlock} aria-label="Interactive product preview">
        <div className={productStyles.previewCaption}><span>YOUR CALENDAR, WITH AN ASSISTANT</span><span>↓ Explore WatAgent</span></div>
        <CalendarPreview onFeature={setFeature} onAskAgent={onAskAgent} />
      </section>
      <section id="showcase" className={styles.reducedBlock}>
        <div className={productStyles.sectionIntro}>
          <span className={productStyles.label}>A CLOSER LOOK</span>
          <h2>Turn the band, <em>read a side.</em></h2>
        </div>
        <FeatureReel active={feature} onActive={setFeature} />
      </section>
      <section id="assistant" className={styles.reducedBlock}>
        <AgentReel onAskAgent={onAskAgent} />
      </section>
    </div>
  );
}
