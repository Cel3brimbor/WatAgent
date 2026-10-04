import { isFeedId, type ImportedCalendarSource } from "@/calendar/types";
import { ApiError, apiFetch, apiJson, errorFromResponse } from "@/shared/api-base";

export type RuleFeed = ImportedCalendarSource;

export type AgentRuleRun = {
  id: string;
  trigger: "sync" | "manual";
  status: "running" | "done" | "failed";
  matched: number;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
};

export type AgentRule = {
  id: string;
  name: string;
  sourceFeed: RuleFeed;
  /** events, tasks or cal-<uuid>. */
  targetCalendarId: string;
  instruction: string;
  titleContains: string | null;
  lookaheadDays: number;
  requireApproval: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastRun: AgentRuleRun | null;
};

export type AgentRuleDraft = {
  name: string;
  sourceFeed: RuleFeed;
  targetCalendarId: string;
  instruction: string;
  titleContains?: string | null;
  lookaheadDays?: number;
  requireApproval?: boolean;
  enabled?: boolean;
};

export type RuleProposal = {
  sourceId: string;
  sourceTitle: string;
  action: "add" | "update";
  title: string;
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
};

export type RulePreview = {
  matched: number;
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  deferred: number;
  unanswered: number;
  proposals: RuleProposal[];
};

export type RuleRunLine = {
  id: string;
  name: string;
  state: "running" | "done" | "failed";
  added: number;
  updated: number;
  removed: number;
  skipped: number;
  pending: number;
  error?: string;
};

const TARGET = /^(events|tasks|cal-[0-9a-f-]{36})$/;

/** The server doesn't have Agent rules yet. */
export class RulesUnavailableError extends Error {
  constructor() {
    super("Agent rules aren't available on this server yet.");
  }
}

function count(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function text(raw: unknown, max: number): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, max) : null;
}

function feedOf(raw: unknown): RuleFeed | null {
  return isFeedId(raw) ? raw : null;
}

export function ruleRunOf(raw: unknown): AgentRuleRun | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.id !== "string") return null;
  return {
    id: rec.id,
    trigger: rec.trigger === "manual" ? "manual" : "sync",
    status: rec.status === "running" ? "running" : rec.status === "failed" ? "failed" : "done",
    matched: count(rec.matched),
    added: count(rec.added),
    updated: count(rec.updated),
    removed: count(rec.removed),
    skipped: count(rec.skipped),
    error: text(rec.error, 300),
    startedAt: Number(rec.startedAt) || Date.now(),
    finishedAt: rec.finishedAt == null ? null : Number(rec.finishedAt) || null,
  };
}

export function agentRuleOf(raw: unknown): AgentRule | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const sourceFeed = feedOf(rec.sourceFeed);
  const name = text(rec.name, 60);
  const instruction = text(rec.instruction, 1000);
  if (typeof rec.id !== "string" || !sourceFeed || !name || !instruction) return null;
  if (typeof rec.targetCalendarId !== "string" || !TARGET.test(rec.targetCalendarId)) return null;
  const lookahead = Number(rec.lookaheadDays);
  return {
    id: rec.id,
    name,
    sourceFeed,
    targetCalendarId: rec.targetCalendarId,
    instruction,
    titleContains: text(rec.titleContains, 100),
    lookaheadDays: Number.isInteger(lookahead) && lookahead >= 1 && lookahead <= 60 ? lookahead : 21,
    requireApproval: rec.requireApproval !== false,
    enabled: rec.enabled !== false,
    createdAt: Number(rec.createdAt) || Date.now(),
    updatedAt: Number(rec.updatedAt) || Date.now(),
    lastRun: ruleRunOf(rec.lastRun),
  };
}

function proposalOf(raw: unknown): RuleProposal | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const title = text(rec.title, 200);
  if (typeof rec.sourceId !== "string" || !title || typeof rec.date !== "string") return null;
  return {
    sourceId: rec.sourceId,
    sourceTitle: text(rec.sourceTitle, 200) ?? "",
    action: rec.action === "update" ? "update" : "add",
    title,
    date: rec.date,
    allDay: rec.allDay === true,
    startTime: text(rec.startTime, 5) ?? undefined,
    endTime: text(rec.endTime, 5) ?? undefined,
  };
}

export function rulePreviewOf(raw: unknown): RulePreview {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    matched: count(rec.matched),
    added: count(rec.added),
    updated: count(rec.updated),
    removed: count(rec.removed),
    skipped: count(rec.skipped),
    deferred: count(rec.deferred),
    unanswered: count(rec.unanswered),
    proposals: Array.isArray(rec.proposals)
      ? rec.proposals.map(proposalOf).filter((proposal): proposal is RuleProposal => proposal != null)
      : [],
  };
}

/** One line of a run stream, or null for anything that isn't a rule update. */
export function ruleRunLineOf(raw: unknown): RuleRunLine | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (rec.type !== "rule" || typeof rec.id !== "string") return null;
  const state = rec.state === "running" || rec.state === "done" || rec.state === "failed" ? rec.state : null;
  if (!state) return null;
  return {
    id: rec.id,
    name: text(rec.name, 60) ?? "Agent rule",
    state,
    added: count(rec.added),
    updated: count(rec.updated),
    removed: count(rec.removed),
    skipped: count(rec.skipped),
    pending: count(rec.pending),
    error: text(rec.error, 300) ?? undefined,
  };
}

/** "Study blocks: 3 waiting for approval", or null when a run changed nothing. */
export function ruleRunSummary(line: RuleRunLine): string | null {
  if (line.state === "failed") return `${line.name}: ${line.error ?? "didn't finish"}`;
  if (line.state !== "done") return null;
  const changed = line.added + line.updated + line.removed;
  if (changed === 0) return null;
  const parts = [
    line.added ? `${line.added} added` : null,
    line.updated ? `${line.updated} updated` : null,
    line.removed ? `${line.removed} removed` : null,
  ].filter(Boolean);
  if (line.pending >= changed) return `${line.name}: ${changed} waiting for your approval`;
  return `${line.name}: ${parts.join(", ")}${line.pending ? ` (${line.pending} waiting for approval)` : ""}`;
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const GONE = "That rule no longer exists.";

//the server answers both a missing route and a missing rule with 404, so each call says which it most likely means
async function rulesCall<T>(path: string, init: RequestInit | undefined, notFound: "gone" | "unavailable"): Promise<T> {
  try {
    return await apiJson<T>(path, init);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) throw err;
    throw notFound === "gone" ? new Error(GONE) : new RulesUnavailableError();
  }
}

//feeds that have an enabled rule, as last seen; null until the list has loaded once
let feedsWithRules: Set<RuleFeed> | null = null;

function remember(rules: AgentRule[]) {
  feedsWithRules = new Set(rules.filter((rule) => rule.enabled).map((rule) => rule.sourceFeed));
}

export async function listAgentRules(): Promise<{ rules: AgentRule[]; limit: number }> {
  const payload = await rulesCall<{ rules?: unknown; limit?: unknown }>("/api/agent/rules", undefined, "unavailable");
  const rules = Array.isArray(payload.rules) ? payload.rules.map(agentRuleOf).filter((rule): rule is AgentRule => rule != null) : [];
  remember(rules);
  return { rules, limit: count(payload.limit) || 10 };
}

export async function createAgentRule(draft: AgentRuleDraft): Promise<AgentRule> {
  const payload = await rulesCall<{ rule?: unknown }>(
    "/api/agent/rules",
    { method: "POST", body: JSON.stringify(draft) },
    "unavailable",
  );
  const rule = agentRuleOf(payload.rule);
  if (!rule) throw new Error("The rule was saved, but couldn't be read back. Reload to see it.");
  if (rule.enabled) feedsWithRules?.add(rule.sourceFeed);
  return rule;
}

export async function updateAgentRule(id: string, patch: Partial<AgentRuleDraft>): Promise<AgentRule> {
  const payload = await rulesCall<{ rule?: unknown }>(
    "/api/agent/rules",
    { method: "PATCH", body: JSON.stringify({ id, ...patch }) },
    "gone",
  );
  const rule = agentRuleOf(payload.rule);
  if (!rule) throw new Error("The rule was saved, but couldn't be read back. Reload to see it.");
  if (rule.enabled) feedsWithRules?.add(rule.sourceFeed);
  return rule;
}

export async function deleteAgentRule(id: string): Promise<void> {
  await rulesCall("/api/agent/rules", { method: "DELETE", body: JSON.stringify({ id }) }, "gone");
}

export async function previewAgentRule(draft: AgentRuleDraft & { id?: string }): Promise<RulePreview> {
  return rulePreviewOf(
    await rulesCall(
      "/api/agent/rules/preview",
      { method: "POST", body: JSON.stringify({ ...draft, timeZone: timeZone() }) },
      draft.id ? "gone" : "unavailable",
    ),
  );
}

/** Runs one rule, or every enabled rule on a feed, reporting each rule as it starts and finishes. */
export async function runAgentRules(
  target: { id: string } | { sourceFeed: RuleFeed },
  onLine?: (line: RuleRunLine) => void,
): Promise<RuleRunLine[]> {
  const res = await apiFetch("/api/agent/rules/run", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, trigger: "id" in target ? "manual" : "sync", timeZone: timeZone() }),
  });
  if (res.status === 404) throw "id" in target ? new Error(GONE) : new RulesUnavailableError();
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("ndjson") || !res.body) {
    throw await errorFromResponse(res, "The rules didn't run. Try again.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const finished = new Map<string, RuleRunLine>();
  let buffer = "";
  const take = (raw: string) => {
    if (!raw.trim()) return;
    const event = JSON.parse(raw) as Record<string, unknown>;
    if (event.type === "error") throw new ApiError(text(event.error, 300) ?? "The rules didn't run. Try again.", 400);
    const line = ruleRunLineOf(event);
    if (!line) return;
    onLine?.(line);
    if (line.state !== "running") finished.set(line.id, line);
  };
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) take(line);
    if (done) break;
  }
  take(buffer);
  return [...finished.values()];
}

type RunReport = { feed: RuleFeed; lines: RuleRunLine[] };
const listeners = new Set<(report: RunReport) => void>();

/** Hears about the rule runs that follow a feed sync. */
export function onRulesRan(listener: (report: RunReport) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** After a feed syncs, runs its rules in the background. Feeds known to have no rules are skipped. */
export function runRulesAfterSync(feed: RuleFeed): void {
  if (feedsWithRules && !feedsWithRules.has(feed)) return;
  void runAgentRules({ sourceFeed: feed })
    .then((lines) => {
      if (lines.length === 0) return;
      for (const listener of listeners) listener({ feed, lines });
    })
    .catch(() => undefined);
}
