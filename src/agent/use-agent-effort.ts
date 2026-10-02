"use client";

import { useEffect, useRef, useState } from "react";
import { readAgentEffort, writeAgentEffort, type AgentEffort } from "@/agent/agent-effort";
import { getCalendarSettings, patchCalendarSettings } from "@/calendar/approval-client";

export function useAgentEffort(): { effort: AgentEffort; setEffort: (next: AgentEffort) => void } {
  const [effort, setEffortState] = useState<AgentEffort>("none");
  const skipSaveRef = useRef(true);
  const dirtyRef = useRef(false);
  const latestRef = useRef<AgentEffort>("none");
  const savingRef = useRef(false);
  const queuedRef = useRef(false);

  async function flush() {
    if (skipSaveRef.current || savingRef.current) {
      queuedRef.current = true;
      return;
    }
    savingRef.current = true;
    try {
      do {
        queuedRef.current = false;
        const next = latestRef.current;
        await patchCalendarSettings({ agentEffort: next });
      } while (queuedRef.current);
    } catch {
      //keep the local choice when the profile save fails
    } finally {
      savingRef.current = false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    const local = readAgentEffort();
    latestRef.current = local;
    setEffortState(local);
    void (async () => {
      try {
        const remote = await getCalendarSettings();
        if (cancelled) return;
        if (remote.agentEffort != null && !dirtyRef.current) {
          latestRef.current = remote.agentEffort;
          writeAgentEffort(remote.agentEffort);
          setEffortState(remote.agentEffort);
        }
        skipSaveRef.current = false;
        if (remote.agentEffort == null || dirtyRef.current) void flush();
      } catch {
        //keep the local choice when offline or the settings request fails
        if (cancelled) return;
        skipSaveRef.current = false;
        if (dirtyRef.current) void flush();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function setEffort(next: AgentEffort) {
    latestRef.current = next;
    dirtyRef.current = true;
    setEffortState(next);
    writeAgentEffort(next);
    void flush();
  }

  return { effort, setEffort };
}
