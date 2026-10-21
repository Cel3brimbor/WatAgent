"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AgentActivity, cloneActivity } from "@/agent/agent-activity";
import { MessageContent } from "@/agent/message-content";
import type { ActivityPart, ChatMessage, ToolEventRecord } from "@/agent/types";
import { prefersReducedMotion } from "@/shared/motion";
import { CarouselReel } from "./carousel-reel";
import { AGENT_SCENARIOS, type AgentScenarioId } from "./product-demo-conversations";
import styles from "./product.module.css";

export const AGENT_ITEMS = AGENT_SCENARIOS.map((scenario) => ({
  id: scenario.id as AgentScenarioId,
  title: scenario.title,
  kicker: scenario.kicker,
}));

export function scenarioOf(id: AgentScenarioId) {
  return AGENT_SCENARIOS.find((scenario) => scenario.id === id) ?? AGENT_SCENARIOS[0];
}

const REPLY_DELAY_MS = 1000;
const THOUGHT_CHARS_PER_S = 560;
const ANSWER_CHARS_PER_S = 280;
const TOOL_CALL_MS = 320;
const TOOL_GAP_MS = 90;

type LiveView = {
  kind: "live";
  assistant: boolean;
  activity: ActivityPart[];
  content: string;
  streaming: boolean;
};

type ThreadView = { kind: "rest" } | { kind: "hold" } | LiveView;

function advance(text: string, index: number, budget: number): number {
  if (budget <= 0 || index >= text.length) return index;
  let next = Math.min(text.length, index + budget);
  if (next < text.length && !/\s/.test(text[next - 1] ?? "")) {
    const brake = text.slice(next, next + 24).search(/\s/);
    if (brake !== -1) next += brake + 1;
  }
  return next;
}

function createPlayer() {
  let timer = 0;
  let dead = false;
  let finish = () => {};
  return {
    get dead() {
      return dead;
    },
    cancel() {
      dead = true;
      window.clearTimeout(timer);
      finish();
      finish = () => {};
    },
    wait(ms: number) {
      return new Promise<void>((resolve) => {
        finish = resolve;
        if (dead) {
          resolve();
          return;
        }
        timer = window.setTimeout(resolve, ms);
      });
    },
    //timer, not a frame loop: a hidden tab stops painting and would freeze the turn
    stream(text: string, rate: number, onSlice: (value: string) => void) {
      return new Promise<void>((resolve) => {
        finish = resolve;
        if (dead || !text) {
          if (!dead && text) onSlice(text);
          resolve();
          return;
        }
        let index = 0;
        let last = performance.now();
        let acc = 0;
        const tick = () => {
          if (dead) {
            resolve();
            return;
          }
          const now = performance.now();
          const dt = Math.min(0.08, (now - last) / 1000);
          last = now;
          acc += rate * dt;
          const take = Math.floor(acc);
          acc -= take;
          if (take > 0) index = advance(text, index, take);
          onSlice(text.slice(0, index));
          if (index >= text.length) {
            onSlice(text);
            resolve();
            return;
          }
          timer = window.setTimeout(tick, 32);
        };
        timer = window.setTimeout(tick, 32);
      });
    },
  };
}

async function runScript(
  player: ReturnType<typeof createPlayer>,
  message: ChatMessage,
  publish: (patch: Partial<LiveView>) => void,
) {
  const draft: ActivityPart[] = [];
  for (const part of message.activity ?? []) {
    if (player.dead) return;
    if (part.kind === "thought") {
      const thought = { ...part.thought, text: "", seconds: undefined };
      draft.push({ kind: "thought", thought });
      publish({ activity: cloneActivity(draft) });
      await player.stream(part.thought.text, THOUGHT_CHARS_PER_S, (text) => {
        thought.text = text;
        publish({ activity: cloneActivity(draft) });
      });
      if (player.dead) return;
      const seconds = part.thought.seconds ?? Math.max(1, Math.round(part.thought.text.length / 90));
      thought.seconds = seconds;
      publish({ activity: cloneActivity(draft) });
      await player.wait(TOOL_GAP_MS);
      continue;
    }
    const events: ToolEventRecord[] = [];
    draft.push({ kind: "tools", events });
    for (const source of part.events) {
      if (player.dead) return;
      const row: ToolEventRecord = { ...source, state: "calling" };
      events.push(row);
      publish({ activity: cloneActivity(draft) });
      await player.wait(TOOL_CALL_MS);
      if (player.dead) return;
      row.state = source.state === "failed" ? "failed" : "succeeded";
      publish({ activity: cloneActivity(draft) });
      await player.wait(TOOL_GAP_MS);
    }
  }
  if (player.dead) return;
  await player.stream(message.content, ANSWER_CHARS_PER_S, (content) => {
    publish({ content });
  });
}

function Bubble({
  message,
  activity,
  content,
  streaming,
  holdToggle,
}: {
  message: ChatMessage;
  activity?: ActivityPart[];
  content: string;
  streaming: boolean;
  holdToggle: boolean;
}) {
  const assistant = message.role === "assistant";
  return (
    <div className={`bubble-row is-${message.role} is-latest`}>
      <article className={`bubble bubble-${message.role}`} data-empty={assistant && !content.trim() ? "true" : undefined}>
        <span className="bubble-role">{assistant ? "WatAgent" : "You"}</span>
        <div className="bubble-body">
          {assistant ? (
            <AgentActivity
              parts={activity}
              streaming={streaming && !content.trim()}
              toolsLive={streaming}
              reopenWhileCalling={!holdToggle}
            />
          ) : null}
          {assistant ? (
            content.trim() ? <MessageContent content={content} pending={streaming} /> : null
          ) : (
            <p className={styles.agentUserText}>{content}</p>
          )}
        </div>
      </article>
    </div>
  );
}

export function DemoThread({ messages, playing }: { messages: ChatMessage[]; playing: boolean }) {
  const user = messages.find((message) => message.role === "user");
  const assistant = messages.find((message) => message.role === "assistant");
  const [view, setView] = useState<ThreadView>({ kind: "rest" });
  const [inView, setInView] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  //follow the stream only while the reader is already at the bottom
  const stick = useRef(true);
  const lastTop = useRef(0);
  const locking = useRef(false);
  const armed = playing && inView;

  if (!playing && view.kind !== "rest") {
    setView({ kind: "rest" });
  } else if (armed && view.kind !== "live") {
    setView({ kind: "live", assistant: false, activity: [], content: "", streaming: false });
  } else if (playing && !inView && view.kind !== "hold") {
    setView({ kind: "hold" });
  }

  useEffect(() => {
    const node = threadRef.current?.closest("article") ?? threadRef.current;
    if (!node) return;
    //the ring turns with a transform, which does not emit a page scroll
    const measure = () => {
      const box = node.getBoundingClientRect();
      const shown = box.bottom > 72 && box.top < window.innerHeight - 48 && box.width > 80 && box.height > 80;
      const gone = box.bottom < 48 || box.top > window.innerHeight - 24 || box.width < 40;
      setInView((current) => (shown ? true : gone ? false : current));
    };
    measure();
    const later = window.setTimeout(measure, 480);
    const observer = new IntersectionObserver(measure, { threshold: [0, 0.25, 0.6] });
    observer.observe(node);
    document.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(later);
      observer.disconnect();
      document.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [playing]);

  useEffect(() => {
    if (!armed || !assistant) return;
    const player = createPlayer();
    let cancelled = false;
    const publish = (patch: Partial<LiveView>) => {
      if (cancelled) return;
      setView((current) => (current.kind === "live" ? { ...current, ...patch } : current));
    };
    const task = (async () => {
      await player.wait(REPLY_DELAY_MS);
      if (cancelled || player.dead) return;
      if (prefersReducedMotion()) {
        publish({
          assistant: true,
          activity: assistant.activity ?? [],
          content: assistant.content,
          streaming: false,
        });
        return;
      }
      publish({ assistant: true, activity: [], content: "", streaming: true });
      await runScript(player, assistant, publish);
      if (cancelled || player.dead) return;
      publish({ streaming: false });
    })();
    return () => {
      cancelled = true;
      player.cancel();
      void task;
    };
  }, [armed, assistant]);

  useEffect(() => {
    const port = threadRef.current;
    if (!port) return;
    const onScroll = () => {
      if (locking.current) {
        lastTop.current = port.scrollTop;
        return;
      }
      const gap = port.scrollHeight - port.scrollTop - port.clientHeight;
      const movedUp = port.scrollTop < lastTop.current - 8;
      //only a deliberate move away from the bottom lets go
      if (movedUp && gap > 32) stick.current = false;
      if (gap < 20) stick.current = true;
      lastTop.current = port.scrollTop;
    };
    port.addEventListener("scroll", onScroll, { passive: true });
    return () => port.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const port = threadRef.current;
    if (!port || !playing || view.kind !== "live") return;
    if (!view.assistant) {
      stick.current = true;
      port.scrollTop = 0;
      lastTop.current = 0;
      return;
    }
    if (!stick.current) return;
    const next = port.scrollHeight - port.clientHeight;
    if (next <= port.scrollTop + 1) {
      lastTop.current = port.scrollTop;
      return;
    }
    //our own scroll must not read as the reader leaving the bottom
    locking.current = true;
    port.scrollTop = next;
    lastTop.current = port.scrollTop;
    locking.current = false;
  }, [playing, view]);

  const live = view.kind === "live";
  const showAssistant = live ? view.assistant : view.kind === "rest" && Boolean(assistant);
  const activity = live ? view.activity : assistant?.activity;
  const answer = live ? view.content : assistant?.content ?? "";
  const streaming = live && view.streaming;

  return (
    <div
      ref={threadRef}
      className={`message-list ${styles.agentThread}`}
      tabIndex={0}
      aria-label="Sample conversation"
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (!target.closest(".agent-thinking-toggle, .agent-reasoning-preview")) return;
        //opening a block above the fold is a choice to read, so stop chasing the stream
        window.requestAnimationFrame(() => {
          const port = threadRef.current;
          if (!port) return;
          const gap = port.scrollHeight - port.scrollTop - port.clientHeight;
          stick.current = gap < 48;
          lastTop.current = port.scrollTop;
        });
      }}
    >
      {user && view.kind !== "hold" ? (
        <Bubble key={live ? "sent" : user.id} message={user} content={user.content} streaming={false} holdToggle={false} />
      ) : null}
      {showAssistant && assistant ? (
        <Bubble
          key={playing ? "reply" : assistant.id}
          message={assistant}
          activity={activity}
          content={answer}
          streaming={streaming}
          holdToggle={live}
        />
      ) : null}
    </div>
  );
}

export function AgentReel({ onAskAgent }: { onAskAgent: () => void }) {
  const [active, setActive] = useState<AgentScenarioId>("weekend-plan");

  return (
    <div className={styles.agentShowcase}>
      <div className={styles.sectionIntro}>
        <span className={styles.label}>THE ASSISTANT</span>
        <h2>Ask in plain language.<br />Watch it <em>work the calendar.</em></h2>
        <p>Real turns from student weeks: thinking, tool calls, and answers — queued for your approval in the app.</p>
      </div>
      <CarouselReel
        items={AGENT_ITEMS}
        active={active}
        onActive={setActive}
        ariaLabel="Assistant examples"
        hint="Drag to turn it — it loops. Scroll a card to read the turn. Expand thinking and tool steps while it writes."
        renderBody={(id) => (
          <div className={styles.agentCardBody}>
            <DemoThread messages={scenarioOf(id).messages} playing={id === active} />
            <button type="button" className={styles.ask} onClick={onAskAgent}>Ask with your own week</button>
          </div>
        )}
      />
    </div>
  );
}
