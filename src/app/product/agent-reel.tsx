"use client";

import { useState } from "react";
import { AgentActivity } from "@/agent/agent-activity";
import { MessageContent } from "@/agent/message-content";
import type { ChatMessage } from "@/agent/types";
import { CarouselReel } from "./carousel-reel";
import { AGENT_SCENARIOS, type AgentScenarioId } from "./product-demo-conversations";
import styles from "./product.module.css";

const ITEMS = AGENT_SCENARIOS.map((scenario) => ({
  id: scenario.id as AgentScenarioId,
  title: scenario.title,
  kicker: scenario.kicker,
}));

function scenarioOf(id: AgentScenarioId) {
  return AGENT_SCENARIOS.find((scenario) => scenario.id === id) ?? AGENT_SCENARIOS[0];
}

function DemoThread({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className={`message-list ${styles.agentThread}`}>
      {messages.map((message) => (
        <div key={message.id} className={`bubble-row is-${message.role} is-latest`}>
          <article className={`bubble bubble-${message.role}`} data-empty={message.role === "assistant" && !message.content.trim() ? "true" : undefined}>
            <span className="bubble-role">{message.role === "user" ? "You" : "WatAgent"}</span>
            <div className="bubble-body">
              <AgentActivity parts={message.activity} streaming={false} />
              {message.role === "user" ? (
                <p className={styles.agentUserText}>{message.content}</p>
              ) : message.content.trim() ? (
                <MessageContent content={message.content} pending={false} />
              ) : null}
            </div>
          </article>
        </div>
      ))}
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
        items={ITEMS}
        active={active}
        onActive={setActive}
        ariaLabel="Assistant examples"
        hint="Drag sideways. Expand thinking and tool steps like you would in the app."
        renderBody={(id) => (
          <div className={styles.agentCardBody}>
            <DemoThread messages={scenarioOf(id).messages} />
            <button type="button" className={styles.ask} onClick={onAskAgent}>Ask with your own week</button>
          </div>
        )}
      />
    </div>
  );
}
