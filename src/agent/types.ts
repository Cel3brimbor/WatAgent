export type ToolEventState = "calling" | "succeeded" | "failed";

export type ToolEventRecord = {
  id: string;
  tool: string;
  state: ToolEventState;
  callLabel?: string;
  resultSummary?: string;
};

export type ThoughtSegment = {
  id: string;
  text: string;
  startedAt: number;
  /**set once this thought stops, before a tool call or the answer*/
  seconds?: number;
};

export type ActivityPart =
  | { kind: "thought"; thought: ThoughtSegment }
  | { kind: "tools"; events: ToolEventRecord[] };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  activity?: ActivityPart[];
  toolEvents?: ToolEventRecord[];
};

export type ChatSession = {
  id: string;
  title: string;
  titleSource: "auto" | "user";
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  open: boolean;
};

export type LiveActivity = {
  assistantId: string;
  status: string;
};
