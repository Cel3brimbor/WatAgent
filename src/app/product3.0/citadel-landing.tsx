"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AGENT_ITEMS, DemoThread, scenarioOf } from "./agent-reel";
import { FEATURES, FeatureBody, type FeatureId } from "./feature-reel";
import { CalendarPreview } from "./preview";
import type { AgentScenarioId } from "./product-demo-conversations";
import { scrollToTarget } from "./product-scroll-link";
import type { FlightKind, FlightRegistry } from "./citadel-rig";
import productStyles from "./product.module.css";
import styles from "./citadel.module.css";

type Props = {
  registry: FlightRegistry;
  //false while the plaques ride the rings: no clicks, no streaming
  settled: boolean;
  animated: boolean;
  onAskAgent: () => void;
};

export function CitadelLanding({ registry, settled, animated, onAskAgent }: Props) {
  const [activeAgent, setActiveAgent] = useState<AgentScenarioId>("weekend-plan");
  const [spotlight, setSpotlight] = useState<FeatureId | null>(null);

  function showFeature(id: FeatureId) {
    setSpotlight(id);
    const card = document.getElementById(`feature-${id}`);
    if (card) scrollToTarget(card);
  }

  return (
    <>
      <div className={productStyles.previewCaption} data-citadel-reveal>
        <span>YOUR CALENDAR, WITH AN ASSISTANT</span>
        <span>↓ Explore WatAgent</span>
      </div>
      <LensSlot registry={registry} settled={settled} animated={animated}>
        <CalendarPreview onFeature={showFeature} onAskAgent={onAskAgent} />
      </LensSlot>

      <div className={styles.block} id="showcase">
        <div className={productStyles.sectionIntro} data-citadel-reveal>
          <span className={productStyles.label}>A CLOSER LOOK</span>
          <h2>Five sides, <em>laid flat.</em></h2>
          <p>Tags, events, tasks, calendars, and rules.<br />Open a row. Make a tag on the calendar itself.</p>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map((feature, index) => (
            <FlightCard
              key={feature.id}
              id={`feature-${feature.id}`}
              registry={registry}
              kind="features"
              index={index}
              count={FEATURES.length}
              settled={settled}
              highlight={spotlight === feature.id}
              kicker={feature.kicker}
              title={feature.title}
            >
              <FeatureBody id={feature.id} />
            </FlightCard>
          ))}
        </div>
      </div>

      <div className={styles.block}>
        <div className={productStyles.sectionIntro} data-citadel-reveal>
          <span className={productStyles.label}>THE ASSISTANT</span>
          <h2>Ask in plain language.<br />Watch it <em>work the calendar.</em></h2>
          <p>Real turns from student weeks: thinking, tool calls, and answers — queued for your approval in the app.</p>
        </div>
        <div className={styles.agentGrid}>
          {AGENT_ITEMS.map((item, index) => {
            const active = item.id === activeAgent;
            return (
              <FlightCard
                key={item.id}
                registry={registry}
                kind="agents"
                index={index}
                count={AGENT_ITEMS.length}
                settled={settled}
                highlight={active}
                kicker={item.kicker}
                title={item.title}
              >
                <div className={productStyles.agentCardBody}>
                  {/* the stream arms only after the plaques land; rotating cards stay static */}
                  <DemoThread messages={scenarioOf(item.id).messages} playing={settled && active} />
                  {active ? (
                    <button type="button" className={productStyles.ask} onClick={onAskAgent}>Ask with your own week</button>
                  ) : (
                    <button type="button" className={productStyles.ask} onClick={() => setActiveAgent(item.id)}>Play this turn</button>
                  )}
                </div>
              </FlightCard>
            );
          })}
        </div>
      </div>
    </>
  );
}

function useFlight(
  registry: FlightRegistry,
  key: string,
  kind: FlightKind,
  index: number,
  count: number,
  slot: RefObject<HTMLElement | null>,
  node: RefObject<HTMLElement | null>,
  shade?: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!slot.current || !node.current) return;
    return registry.register(key, { kind, index, count, slot: slot.current, node: node.current, shade: shade?.current });
  }, [registry, key, kind, index, count, slot, node, shade]);
}

function FlightCard({
  registry,
  kind,
  index,
  count,
  settled,
  highlight,
  kicker,
  title,
  id,
  children,
}: {
  registry: FlightRegistry;
  kind: Exclude<FlightKind, "lens">;
  index: number;
  count: number;
  settled: boolean;
  highlight: boolean;
  kicker: string;
  title: string;
  id?: string;
  children: ReactNode;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const node = useRef<HTMLElement>(null);
  useFlight(registry, `${kind}:${index}`, kind, index, count, slot, node);

  return (
    <div ref={slot} className={styles.slot} id={id}>
      <article ref={node} className={styles.card} data-highlight={highlight || undefined} inert={!settled}>
        <header className={productStyles.cardHead}>
          <span>{kicker}</span>
          <h3>{title}</h3>
        </header>
        <div className={productStyles.cardBody}>{children}</div>
      </article>
    </div>
  );
}

function LensSlot({ registry, settled, animated, children }: { registry: FlightRegistry; settled: boolean; animated: boolean; children: ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  const node = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  //the shade only exists once motion is known, so re-register when it mounts
  useFlight(registry, animated ? "lens:animated" : "lens", "lens", 0, 1, slot, node, shade);

  return (
    <div ref={slot} className={styles.lensSlot}>
      <div ref={node} className={styles.lens} inert={!settled}>
        {children}
        {animated ? (
          <div ref={shade} className={styles.lensShade} aria-hidden="true">
            {!settled ? <SphereSlides /> : null}
          </div>
        ) : null}
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
