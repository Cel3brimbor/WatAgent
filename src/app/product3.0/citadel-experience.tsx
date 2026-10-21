"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { ExploreDialog } from "./explore-dialog";
import { ProductScrollLink } from "./product-scroll-link";
import { CitadelLanding } from "./citadel-landing";
import { TIMELINE } from "./citadel-math";
import { setPageLenis } from "./citadel-lenis";
import { createFlightRegistry, createRig } from "./citadel-rig";
import productStyles from "./product.module.css";
import styles from "./citadel.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

//webgl is client only and loads after the copy has painted
const CitadelScene = dynamic(() => import("./citadel-scene"), { ssr: false });

type Motion = "pending" | "full" | "reduced";

type Span = readonly [number, number];
const at = ([start, end]: Span) => ({ position: start, duration: end - start });

export function CitadelExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const landingRef = useRef<HTMLElement>(null);
  const rig = useRef(createRig());
  const registry = useMemo(createFlightRegistry, []);
  const [motion, setMotion] = useState<Motion>("pending");
  //one-way bridge out of the timeline: true once the plaques have landed
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const [ask, setAsk] = useState(false);

  function settle(next: boolean) {
    if (settledRef.current === next) return;
    settledRef.current = next;
    setSettled(next);
  }

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { full: "(prefers-reduced-motion: no-preference)", reduced: "(prefers-reduced-motion: reduce)" },
        (context) => {
          if (context.conditions?.reduced) {
            //no canvas, no pin, no lenis: the copied layout in document flow
            setMotion("reduced");
            settle(true);
            return;
          }
          setMotion("full");
          settle(false);

          const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, autoRaf: false });
          setPageLenis(lenis);
          lenis.on("scroll", ScrollTrigger.update);
          const tick = (time: number) => lenis.raf(time * 1000);
          gsap.ticker.add(tick);
          gsap.ticker.lagSmoothing(0);

          const r = rig.current;
          Object.assign(r, createRig());

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              id: "citadel",
              trigger: trackRef.current,
              start: "top top",
              end: "bottom bottom",
              scrub: 0.8,
              invalidateOnRefresh: true,
              onRefresh: () => registry.measure(),
            },
            onUpdate: () => settle(tl.time() >= TIMELINE.settled),
          });

          tl.addLabel("orbit", 0)
            .to(heroRef.current, { autoAlpha: 0, y: -48, ease: "power1.in", duration: at(TIMELINE.hero).duration }, at(TIMELINE.hero).position)
            .to(r, { spin: 0, ease: "sine.out", duration: at(TIMELINE.spin).duration }, at(TIMELINE.spin).position)
            .to(r, { align: 1, ease: "power2.inOut", duration: at(TIMELINE.align).duration }, at(TIMELINE.align).position)
            .addLabel("aligned", TIMELINE.align[1])
            .to(r, { morph: 1, ease: "power2.inOut", duration: at(TIMELINE.morph).duration }, at(TIMELINE.morph).position)
            .to(r, { thick: 1, ease: "power2.out", duration: at(TIMELINE.thick).duration }, at(TIMELINE.thick).position)
            .to(r, { accent: 0, ease: "power1.in", duration: at(TIMELINE.accent).duration }, at(TIMELINE.accent).position)
            .to(r, { fly: 1, duration: at(TIMELINE.fly).duration }, at(TIMELINE.fly).position)
            .to(r, { lens: 1, ease: "power2.inOut", duration: at(TIMELINE.lens).duration }, at(TIMELINE.lens).position)
            .to(r, { ring: 0, ease: "power1.out", duration: at(TIMELINE.ring).duration }, at(TIMELINE.ring).position)
            .fromTo(
              "[data-citadel-reveal]",
              { autoAlpha: 0, y: 28 },
              { autoAlpha: 1, y: 0, ease: "power2.out", stagger: 0.04, duration: 0.14 },
              TIMELINE.fly[1] - 0.1,
            )
            .addLabel("settled", TIMELINE.settled)
            .set({}, {}, 1);

          return () => {
            gsap.ticker.remove(tick);
            gsap.ticker.lagSmoothing(500, 33);
            lenis.destroy();
            setPageLenis(null);
            registry.reset();
          };
        },
      );
    },
    { scope: rootRef },
  );

  //the landing reflows when a row opens or the viewport changes; recache slot boxes
  useEffect(() => {
    const landing = landingRef.current;
    if (!landing) return;
    const observer = new ResizeObserver(() => registry.measure());
    observer.observe(landing);
    void document.fonts.ready.then(() => ScrollTrigger.refresh());
    return () => observer.disconnect();
  }, [registry]);

  //handoff: the frame the label passes, inline transforms clear and the slots own layout again
  useEffect(() => {
    if (settled) registry.reset();
  }, [settled, registry]);

  const animated = motion === "full";
  const running = animated && !settled;

  return (
    <div ref={rootRef} className={styles.root} data-motion={motion} data-settled={settled || undefined}>
      <div ref={trackRef} className={styles.track}>
        <section className={styles.stage} aria-label="WatAgent">
          <div className={styles.canvas} data-off={!running || undefined}>
            {animated ? <CitadelScene rig={rig} registry={registry} running={running} /> : null}
          </div>
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
        </section>
      </div>
      <section
        ref={landingRef}
        id="preview"
        className={styles.landing}
        data-flying={running || undefined}
        aria-label="Interactive product preview"
      >
        <CitadelLanding registry={registry} settled={settled} animated={animated} onAskAgent={() => setAsk(true)} />
      </section>
      {ask ? <ExploreDialog onClose={() => setAsk(false)} /> : null}
    </div>
  );
}
