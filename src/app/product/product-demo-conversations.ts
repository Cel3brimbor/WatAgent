import type { ActivityPart, ChatMessage, ToolEventRecord } from "@/agent/types";

export type AgentScenario = {
  id: string;
  title: string;
  kicker: string;
  messages: ChatMessage[];
};

function thought(id: string, text: string, seconds?: number): ActivityPart {
  return { kind: "thought", thought: { id, text, startedAt: 0, seconds } };
}

function tools(events: ToolEventRecord[]): ActivityPart {
  return { kind: "tools", events: events.filter((event) => event.state !== "failed") };
}

function activityFromToolEvents(toolEvents?: ToolEventRecord[]): ActivityPart[] {
  const ok = (toolEvents ?? []).filter((event) => event.state !== "failed");
  return ok.length ? [tools(ok)] : [];
}

function normalizeActivity(message: ChatMessage): ActivityPart[] | undefined {
  if (message.activity?.length) {
    return message.activity
      .map((part) => (part.kind === "tools" ? tools(part.events) : part))
      .filter((part) => part.kind !== "tools" || part.events.length > 0);
  }
  const fromTools = activityFromToolEvents(message.toolEvents);
  return fromTools.length ? fromTools : undefined;
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.flatMap((message) => {
    if (message.role === "assistant" && message.content.includes("unavailable right now")) {
      const activity = normalizeActivity(message);
      if (!activity?.length) return [];
      return [{ ...message, content: "", activity, toolEvents: undefined }];
    }
    const activity = normalizeActivity(message);
    const next: ChatMessage = { ...message, toolEvents: undefined };
    if (activity) next.activity = activity;
    else delete next.activity;
    return [next];
  });
}

export const AGENT_SCENARIOS: AgentScenario[] = [
  {
    id: "weekend-plan",
    title: "Plan the weekend",
    kicker: "Catch-up across classes",
    messages: normalizeMessages([
      {
        id: "msg-weekend-user",
        role: "user",
        content:
          "On the weekend, I need to catch up content for these classes: programming, linear algebra, calculus, engineering professions and practice, classical mechanics. On Sunday, I need a task to make a plan for the coming week.",
      },
      {
        id: "msg-weekend-assistant",
        role: "assistant",
        content:
          "Done! Here's what I set up for the weekend (Reading Week, so no classes):\n\n**Saturday, Oct 10**\n- Catch up: Programming (ECE 150)\n- Catch up: Linear Algebra (MATH 115)\n- Catch up: Calculus (MATH 117)\n\n**Sunday, Oct 11**\n- Catch up: Engineering Profession and Practice (ECE 190)\n- Catch up: Classical Mechanics\n- **Task:** Make a plan for the coming week\n\nAll are all-day items so you can fit them in however works best. Want me to adjust the split or add specific times?",
        activity: [
          thought(
            "thought-weekend-1",
            `The user wants to:
1. Add catch-up content events/tasks for these classes on the weekend (Saturday Oct 10 and Sunday Oct 11, 2026):
   - Programming (ECE 150)
   - Linear Algebra (MATH 115)
   - Calculus (MATH 117)
   - Engineering Professions and Practice (ECE 190)
   - Classical Mechanics (this one I don't see in their schedule, but the user named it)
2. On Sunday, add a task to "make a plan for the coming week"

Today is Wednesday, October 7, 2026. The weekend would be Saturday Oct 10 and Sunday Oct 11, 2026.

The user said "on the weekend" - that's Saturday and Sunday. They didn't specify which day for which class. I'll spread them across both days. Let me think about how to distribute:

- Saturday (Oct 10): Programming, Linear Algebra, Calculus
- Sunday (Oct 11): Engineering Professions and Practice, Classical Mechanics

Or maybe I should just put them all as all`,
            6,
          ),
          tools([
            {
              id: "tool-list-weekend",
              tool: "list_calendar_items",
              state: "succeeded",
              callLabel: "list_calendar_items(oct 10th, oct 11th)",
              resultSummary: "Found 4 calendar items",
            },
          ]),
          thought(
            "thought-weekend-2",
            `The weekend is Saturday Oct 10 and Sunday Oct 11. Let me note what's on those days:

Saturday Oct 10:
- Open Rec Basketball 9:00 AM–5:30 PM (read-only)
- Open Rec Badminton 9:00 AM–5:30 PM (read-only)
- Reading Week (all-day, Oct 10–18)

Sunday Oct 11:
- Nothing listed (the basketball event from Oct 9 spans to Oct 10, not Oct 11)

So the weekend is mostly free (Reading Week, no classes). The user wants to:
1. Catch up content for: programming (ECE 150), linear algebra (MATH 115), calculus (MATH 117), engineering professions and practice (ECE 190), classical mechanics (MATH 124? or similar)
2. On Sunday, a task to make a plan for the coming week.

The user didn't give specific times for the catch-up content. They said "on the weekend" which is Saturday and Sunday. Since no clock times were given, I should use`,
            14,
          ),
          tools([
            {
              id: "tool-add-prog",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Catch up: Programming (ECE 150)", event, oct 10th, all day)',
              resultSummary: 'Queued event "Catch up: Programming (ECE 150)" for your approval',
            },
            {
              id: "tool-add-la",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Catch up: Linear Algebra (MATH 115)", event, oct 10th, all day)',
              resultSummary: 'Queued event "Catch up: Linear Algebra (MATH 115)" for your approval',
            },
            {
              id: "tool-add-calc",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Catch up: Calculus (MATH 117)", event, oct 10th, all day)',
              resultSummary: 'Queued event "Catch up: Calculus (MATH 117)" for your approval',
            },
            {
              id: "tool-add-ece",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Catch up: Engineering Profession and Practice (ECE 190)", event, oct 11th, all day)',
              resultSummary: 'Queued event "Catch up: Engineering Profession and Practice (ECE 190)" for your approval',
            },
            {
              id: "tool-add-mech",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Catch up: Classical Mechanics", event, oct 11th, all day)',
              resultSummary: 'Queued event "Catch up: Classical Mechanics" for your approval',
            },
            {
              id: "tool-add-plan",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Make a plan for the coming week", task, oct 11th, all day)',
              resultSummary: 'Queued task "Make a plan for the coming week" for your approval',
            },
          ]),
          thought("thought-weekend-3", "All items were created successfully. Let me summarize what I did.\n", 4),
        ],
      },
    ]),
  },
  {
    id: "weekend-times",
    title: "Space the day",
    kicker: "Lunch, dinner, flex time",
    messages: normalizeMessages([
      {
        id: "msg-space-user",
        role: "user",
        content: "Can you space them out throughout the day. Add time for lunch and dinner and Flex Time",
      },
      {
        id: "msg-space-assistant",
        role: "assistant",
        content:
          "Done — catch-up blocks are timed on both days, with **Flex Time**, **Lunch**, and **Dinner** between them:\n\n**Saturday, Oct 10**\n- 9:00–11:00 · Catch up: Programming (ECE 150)\n- 11:00–12:00 · Flex Time\n- 12:00–1:00 · Lunch\n- 1:00–3:00 · Catch up: Linear Algebra (MATH 115)\n- 3:00–4:00 · Flex Time\n- 4:00–5:00 · Dinner\n- 5:00–7:00 · Catch up: Calculus (MATH 117)\n\n**Sunday, Oct 11**\n- 9:00–11:00 · Catch up: Engineering Profession and Practice (ECE 190)\n- 11:00–12:00 · Flex Time\n- 12:00–1:00 · Lunch\n- 1:00–3:00 · Catch up: Classical Mechanics\n- 3:00–4:00 · Flex Time\n- 4:00–5:00 · Dinner\n- 5:00 · **Task:** Make a plan for the coming week\n\nEverything is queued for your approval. Want any block moved earlier or later?",
        activity: [
          thought(
            "thought-space-1",
            `The user wants me to space out the weekend items throughout the day, and add time for lunch, dinner, and flex time. Let me think about how to structure this.

First, let me list the current calendar items for Saturday and Sunday to see what's already there.

Today is Wednesday, October 7, 2026. So:
- Saturday = October 10, 2026
- Sunday = October 11, 2026

Let me list both days to see what's currently there, then I'll need to update the existing items with times and add lunch, dinner, and flex time slots.

Let me first list both days.
`,
            5,
          ),
          tools([
            {
              id: "tool-space-list",
              tool: "list_calendar_items",
              state: "succeeded",
              callLabel: "list_calendar_items(oct 10th, oct 11th)",
              resultSummary: "Found 10 calendar items",
            },
          ]),
          thought(
            "thought-space-2",
            `The user wants me to space out the catch-up sessions throughout the day, and add time for lunch, dinner, and flex time. Let me plan a reasonable schedule for each day.

**Saturday, Oct 10** - 3 catch-up sessions: Programming, Linear Algebra, Calculus
**Sunday, Oct 11** - 2 catch-up sessions: ECE 190, Classical Mechanics + task "Make a plan for the coming week"

I need to:
1. Update the existing events to have specific times
2. Add lunch, dinner, and flex time events

Let me think of a reasonable schedule. I'll aim for roughly 2-hour study blocks with breaks.

**Saturday, Oct 10:**
- 9:00 AM – 11:00 AM: Catch up: Programming (ECE 150)
- 11:00 AM – 12:00 PM: Flex Time
- 12:00 PM – 1:00 PM: Lunch
- 1:00 PM – 3:00 PM: Catch up: Linear Algebra (MATH 115)
- 3:`,
            30,
          ),
          tools([
            {
              id: "tool-space-up-1",
              tool: "update_calendar_item",
              state: "succeeded",
              callLabel: "update_calendar_item(events, 09:00)",
              resultSummary: 'Queued update to event "Catch up: Programming (ECE 150)" for your approval',
            },
            {
              id: "tool-space-up-2",
              tool: "update_calendar_item",
              state: "succeeded",
              callLabel: "update_calendar_item(events, 13:00)",
              resultSummary: 'Queued update to event "Catch up: Linear Algebra (MATH 115)" for your approval',
            },
            {
              id: "tool-space-up-3",
              tool: "update_calendar_item",
              state: "succeeded",
              callLabel: "update_calendar_item(events, 17:00)",
              resultSummary: 'Queued update to event "Catch up: Calculus (MATH 117)" for your approval',
            },
            {
              id: "tool-space-flex-1",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Flex Time", event, oct 10th, 11:00)',
              resultSummary: 'Queued event "Flex Time" for your approval',
            },
            {
              id: "tool-space-lunch",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Lunch", event, oct 10th, 12:00)',
              resultSummary: 'Queued event "Lunch" for your approval',
            },
          ]),
          thought(
            "thought-space-3",
            `Good, all the updates and adds for Saturday went through. Now I need to add the remaining items for Saturday (Dinner, Flex Time) and all the new items for Sunday (Flex Time, Lunch, Dinner, Flex Time).

Let me plan out the full schedule:

**Saturday, Oct 10:**
- 9:00–11:00: Catch up: Programming (ECE 150) ✓
- 11:00–12:00: Flex Time ✓
- 12:00–13:00: Lunch ✓
- 13:00–15:00: Catch up: Linear Algebra (MATH 115) ✓
- 15:00–16:00: Flex Time (need to add)
- 16:00–17:00: Dinner (need to add)
- 17:00–19:00: Catch up: Calculus (MATH 117) ✓

**Sunday, Oct 11:**
- 9:00–11:00: Catch up: Engineering Profession`,
            19,
          ),
          tools([
            {
              id: "tool-space-dinner-sat",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Dinner", event, oct 10th, 16:00)',
              resultSummary: 'Queued event "Dinner" for your approval',
            },
            {
              id: "tool-space-flex-sun",
              tool: "add_calendar_item",
              state: "succeeded",
              callLabel: 'add_calendar_item("Flex Time", event, oct 11th, 11:00)',
              resultSummary: 'Queued event "Flex Time" for your approval',
            },
          ]),
          thought("thought-space-4", "All updates and additions succeeded. Let me summarize the schedule for the user."),
        ],
      },
    ]),
  },
  {
    id: "search-campus",
    title: "Find an event",
    kicker: "Search upcoming",
    messages: normalizeMessages([
      {
        id: "msg-res-user",
        role: "user",
        content: "when is my next Residence Experience event",
      },
      {
        id: "msg-res-assistant",
        role: "assistant",
        content:
          "Your next **Residence Experience** event is on **Tuesday, October 6, 2026**, **6:00–7:30 PM** at **CMH Great Hall**. It’s on your calendar already; want a travel time blocked before it?",
        toolEvents: [
          {
            id: "tool-res-search",
            tool: "search_upcoming_events",
            state: "succeeded",
            callLabel: 'search_upcoming_events("Residence Experience")',
            resultSummary: 'Found 1 upcoming item matching "Residence Experience"',
          },
        ],
      },
    ]),
  },
  {
    id: "free-slot",
    title: "Use a free slot",
    kicker: "Check, then add",
    messages: normalizeMessages([
      {
        id: "msg-study-user",
        role: "user",
        content: "On Saturday, if there's nothing at 12 pm, add study for 105 midterms",
      },
      {
        id: "msg-study-assistant",
        role: "assistant",
        content:
          "Done. Added **Study for 105 midterms** on Saturday, Oct 3, 12:00–1:00 pm. That slot was free (your only Saturday events are Badminton at 8 pm and Shower at 9 pm).",
        toolEvents: [
          {
            id: "tool-study-list",
            tool: "list_calendar_items",
            state: "succeeded",
            callLabel: "list_calendar_items(oct 3rd)",
            resultSummary: "Found 5 calendar items",
          },
          {
            id: "tool-study-add",
            tool: "add_calendar_item",
            state: "succeeded",
            callLabel: 'add_calendar_item("Study for 105 midterms", event, oct 3rd, 12:00)',
            resultSummary: 'Queued event "Study for 105 midterms" for your approval',
          },
        ],
      },
    ]),
  },
  {
    id: "resize-block",
    title: "Resize a block",
    kicker: "Update duration",
    messages: normalizeMessages([
      {
        id: "msg-3h-user",
        role: "user",
        content: "change the midterm study on Saturday to 3h long",
      },
      {
        id: "msg-3h-assistant",
        role: "assistant",
        content: 'Done — "Study for 105 midterms" on Saturday, Oct 3 is now 3 hours long (12:00 PM–3:00 PM).',
        toolEvents: [
          {
            id: "tool-3h-search",
            tool: "search_upcoming_events",
            state: "succeeded",
            callLabel: 'search_upcoming_events("midterm study")',
            resultSummary: 'Found 1 upcoming item matching "midterm study"',
          },
          {
            id: "tool-3h-update",
            tool: "update_calendar_item",
            state: "succeeded",
            callLabel: "update_calendar_item(item)",
            resultSummary: 'Queued update to event "Study for 105 midterms" for your approval',
          },
        ],
      },
    ]),
  },
  {
    id: "batch-edits",
    title: "Several at once",
    kicker: "Move, remove, add",
    messages: normalizeMessages([
      {
        id: "msg-batch-user",
        role: "user",
        content:
          'Move saturday badminton to from 8:30-11. remove shower. Today from 9-10 am, add review derivatives integration (description says watch visualising video, then finish integration assignment question." 1h after last lecture, add finish physics assignment, finish in class examples.',
      },
      {
        id: "msg-batch-assistant",
        role: "assistant",
        content: "The assistant is unavailable right now. Please try again.",
        toolEvents: [
          {
            id: "tool-batch-badminton",
            tool: "search_upcoming_events",
            state: "succeeded",
            callLabel: 'search_upcoming_events("badminton")',
            resultSummary: 'Found 1 upcoming item matching "badminton"',
          },
          {
            id: "tool-batch-shower",
            tool: "search_upcoming_events",
            state: "succeeded",
            callLabel: 'search_upcoming_events("shower")',
            resultSummary: 'Found 1 upcoming item matching "shower"',
          },
          {
            id: "tool-batch-list",
            tool: "list_calendar_items",
            state: "succeeded",
            callLabel: "list_calendar_items(oct 2nd)",
            resultSummary: "Found 22 calendar items",
          },
          {
            id: "tool-batch-move",
            tool: "update_calendar_item",
            state: "succeeded",
            callLabel: "update_calendar_item(08:30)",
            resultSummary: 'Queued update to event "Badminton" for your approval',
          },
          {
            id: "tool-batch-delete",
            tool: "delete_calendar_item",
            state: "succeeded",
            callLabel: "delete_calendar_item(item)",
            resultSummary: 'Queued delete of event "Shower" for your approval',
          },
          {
            id: "tool-batch-review",
            tool: "add_calendar_item",
            state: "succeeded",
            callLabel: 'add_calendar_item("Review derivatives integration", event, oct 2nd, 09:00)',
            resultSummary: 'Queued event "Review derivatives integration" for your approval',
          },
          {
            id: "tool-batch-physics",
            tool: "add_calendar_item",
            state: "succeeded",
            callLabel: 'add_calendar_item("Finish physics assignment, finish in class examples", event, oct 2nd, 16:20)',
            resultSummary: 'Queued event "Finish physics assignment, finish in class examples" for your approval',
          },
        ],
      },
    ]),
  },
  {
    id: "clarify-time",
    title: "Clarify AM or PM",
    kicker: "Follow-up fix",
    messages: normalizeMessages([
      {
        id: "msg-pm-user",
        role: "user",
        content: "i meant saturday badminton from 8:30 to 11 pm not am",
      },
      {
        id: "msg-pm-assistant",
        role: "assistant",
        content: "Done — Saturday's Badminton is now 8:30 PM–11:00 PM.",
        toolEvents: [
          {
            id: "tool-pm-search",
            tool: "search_upcoming_events",
            state: "succeeded",
            callLabel: 'search_upcoming_events("badminton")',
            resultSummary: 'Found 1 upcoming item matching "badminton"',
          },
          {
            id: "tool-pm-update",
            tool: "update_calendar_item",
            state: "succeeded",
            callLabel: "update_calendar_item(20:30)",
            resultSummary: 'Queued update to event "Badminton" for your approval',
          },
        ],
      },
    ]),
  },
];

export type AgentScenarioId = (typeof AGENT_SCENARIOS)[number]["id"];
