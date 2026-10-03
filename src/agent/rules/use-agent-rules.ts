"use client";

import { useCallback, useEffect, useState } from "react";
import { listAgentRules, RulesUnavailableError, type AgentRule } from "@/agent/rules/rules-client";

export type AgentRulesState = {
  rules: AgentRule[];
  /** unavailable: the server doesn't have Agent rules yet, so the UI hides them. */
  status: "loading" | "ready" | "unavailable" | "error";
  reload: () => Promise<void>;
};

export function useAgentRules(): AgentRulesState {
  const [rules, setRules] = useState<AgentRule[]>([]);
  const [status, setStatus] = useState<AgentRulesState["status"]>("loading");

  const reload = useCallback(async () => {
    try {
      setRules((await listAgentRules()).rules);
      setStatus("ready");
    } catch (err) {
      setStatus(err instanceof RulesUnavailableError ? "unavailable" : "error");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rules, status, reload };
}
