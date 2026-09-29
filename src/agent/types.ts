export type ToolEventState = "calling" | "succeeded" | "failed";

export type ToolEventRecord = {
  id: string;
  tool: string;
  state: ToolEventState;
  resultSummary?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  toolEvents?: ToolEventRecord[];
  model?: string;
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
