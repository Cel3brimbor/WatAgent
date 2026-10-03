"use client";

import { AgentReasoningBlock } from "@/agent/agent-reasoning-block";
import { AgentThinkingBlock } from "@/agent/agent-thinking-block";
import type { ActivityPart } from "@/agent/types";

export function cloneActivity(parts: ActivityPart[]): ActivityPart[] {
  return parts.map((part) =>
    part.kind === "thought"
      ? { kind: "thought", thought: { ...part.thought } }
      : { kind: "tools", events: part.events.map((event) => ({ ...event })) },
  );
}

export function AgentActivity({ parts, streaming }: { parts?: ActivityPart[]; streaming: boolean }) {
  const items = parts ?? [];
  if (items.length === 0) {
    if (!streaming) return null;
    return <AgentReasoningBlock live />;
  }

  return (
    <>
      {items.map((part) => {
        if (part.kind === "thought") {
          const live = streaming && part.thought.seconds == null;
          if (!part.thought.text.trim() && !live) return null;
          return (
            <AgentReasoningBlock
              key={part.thought.id}
              text={part.thought.text}
              live={live}
              seconds={part.thought.seconds}
            />
          );
        }
        const calling = part.events.some((event) => event.state === "calling");
        const latest = part === items[items.length - 1];
        return <AgentThinkingBlock key={part.events[0]?.id ?? "tools"} events={part.events} active={calling || latest} />;
      })}
    </>
  );
}
