export const AGENT_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;

export type AgentEffort = (typeof AGENT_EFFORTS)[number];

const STORAGE_KEY = "watagent.agent.effort";

export function agentEffortLabel(effort: AgentEffort): string {
  return effort.charAt(0).toUpperCase() + effort.slice(1);
}

export function readAgentEffort(): AgentEffort {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (AGENT_EFFORTS as readonly string[]).includes(raw)) return raw as AgentEffort;
  } catch {
    return "none";
  }
  return "none";
}

export function writeAgentEffort(effort: AgentEffort) {
  try {
    window.localStorage.setItem(STORAGE_KEY, effort);
  } catch {
    return;
  }
}
