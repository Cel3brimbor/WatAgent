import type { TimelineItem } from "@/calendar/types";

//fictional week only. nothing here is loaded from the api or a calendar account.

const CLASSES = { id: "tag-classes", name: "Classes", color: "#3d6b8c", cover: "full" as const };
const CAMPUS = { id: "tag-campus", name: "On campus", color: "#c2593b", cover: "half" as const };
const FOCUS = { id: "tag-focus", name: "Deep work", color: "#6f8f3a", cover: "quarter" as const };

type Blueprint = {
  id: string;
  title: string;
  kind: "event" | "task";
  /** javascript weekday, sunday is 0 */
  day: number;
  start?: [number, number];
  end?: [number, number];
  allDay?: boolean;
  location?: string;
  description: string;
  color?: string;
  tag?: { id: string; name: string; color: string; cover: "full" | "half" | "quarter" };
};

const WEEK: Blueprint[] = [
  {
    id: "math",
    title: "MATH 117 · Calculus",
    kind: "event",
    day: 1,
    start: [9, 0],
    end: [10, 20],
    location: "MC 2066",
    description: "Lecture. The notes from last week are the ones to bring — the problem set leans on them.",
    color: "#3d6b8c",
    tag: CLASSES,
  },
  {
    id: "ece",
    title: "ECE 150 · Programming",
    kind: "event",
    day: 1,
    start: [13, 30],
    end: [14, 50],
    location: "E5 3101",
    description: "Lecture on memory and pointers. Sit where you can see the board examples.",
    color: "#3d6b8c",
    tag: CLASSES,
  },
  {
    id: "office",
    title: "Office hours",
    kind: "event",
    day: 1,
    start: [16, 0],
    end: [17, 0],
    location: "DC 2585",
    description: "Drop in with one specific question. The line moves faster that way.",
    color: "#5b8a72",
  },
  {
    id: "studio",
    title: "Design studio",
    kind: "event",
    day: 2,
    start: [10, 0],
    end: [12, 0],
    location: "E7 3343",
    description: "Pin the three directions on the wall before critique. Leave the rest in the notebook.",
    color: "#5b8a72",
    tag: FOCUS,
  },
  {
    id: "study",
    title: "Study group",
    kind: "event",
    day: 2,
    start: [15, 0],
    end: [16, 30],
    location: "DC Library",
    description: "Work the calculus practice set together. Bring the sheet, not just the laptop.",
    color: "#5b8a72",
  },
  {
    id: "draft",
    title: "Problem set checkpoint",
    kind: "task",
    day: 2,
    start: [18, 0],
    end: [18, 30],
    description: "A halfway mark, not the deadline. Finish questions 1–3 so Thursday is only review.",
  },
  {
    id: "tutorial",
    title: "MATH 117 · Tutorial",
    kind: "event",
    day: 3,
    start: [9, 30],
    end: [10, 20],
    location: "MC 4064",
    description: "Small-group tutorial. The worksheet is posted the night before.",
    color: "#3d6b8c",
    tag: CLASSES,
  },
  {
    id: "lab",
    title: "ECE 150 · Lab",
    kind: "event",
    day: 3,
    start: [11, 0],
    end: [12, 30],
    location: "E5 2108",
    description: "Lab on arrays. Pair with whoever you sat with last week so the setup stays the same.",
    color: "#3d6b8c",
    tag: CLASSES,
  },
  {
    id: "talk",
    title: "Talk · How cities remember",
    kind: "event",
    day: 3,
    start: [14, 0],
    end: [15, 0],
    location: "STC 1012",
    description: "A campus talk on public memory and street names. Doors at 1:45. No ticket.",
    color: "#5b8a72",
    tag: CAMPUS,
  },
  {
    id: "math-thu",
    title: "MATH 117 · Calculus",
    kind: "event",
    day: 4,
    start: [9, 0],
    end: [10, 20],
    location: "MC 2066",
    description: "Second lecture of the week. The examples are the ones the assignment quotes.",
    color: "#3d6b8c",
    tag: CLASSES,
  },
  {
    id: "lunch",
    title: "Lunch with Maya",
    kind: "event",
    day: 4,
    start: [12, 0],
    end: [13, 0],
    location: "SLC marketplace",
    description: "Catch up before the afternoon critique. She has the room key if you are running late.",
    color: "#c2593b",
  },
  {
    id: "critique",
    title: "Project critique",
    kind: "event",
    day: 4,
    start: [16, 0],
    end: [17, 30],
    location: "E7 4412",
    description: "Show one direction, not three. The conversation is about what you would cut.",
    color: "#5b8a72",
    tag: FOCUS,
  },
  {
    id: "reading",
    title: "Reading response",
    kind: "task",
    day: 4,
    start: [20, 0],
    end: [20, 30],
    description: "Half a page on the cities talk. Due tonight, so it sits after critique on purpose.",
  },
  {
    id: "due",
    title: "Assignment due",
    kind: "task",
    day: 5,
    allDay: true,
    description: "ECE 150 problem set. It occupies the whole day so it stays visible above the grid.",
  },
  {
    id: "ece-fri",
    title: "ECE 150 · Programming",
    kind: "event",
    day: 5,
    start: [10, 0],
    end: [11, 20],
    location: "E5 3101",
    description: "Friday lecture. Submit the set before you walk in if it is still open.",
    color: "#3d6b8c",
    tag: CLASSES,
  },
  {
    id: "advisor",
    title: "Advisor meeting",
    kind: "event",
    day: 5,
    start: [15, 0],
    end: [15, 45],
    location: "Needles Hall",
    description: "Fifteen minutes on next term’s electives. Bring the two options, not the whole list.",
    color: "#5b8a72",
  },
  {
    id: "market",
    title: "Farmers’ market",
    kind: "event",
    day: 6,
    start: [10, 0],
    end: [11, 30],
    location: "Waterloo Park",
    description: "Saturday market. A soft block so the weekend is not only leftover homework.",
    color: "#b0600f",
  },
  {
    id: "call",
    title: "Call home",
    kind: "task",
    day: 0,
    start: [11, 0],
    end: [11, 30],
    description: "A Sunday call. It is a task so it can be checked off once you have actually dialed.",
  },
];

function at(date: Date, hour: number, minute: number): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0).getTime();
}

export function sampleItems(date: Date): TimelineItem[] {
  return WEEK.filter((item) => item.day === date.getDay()).map((item) => {
    const startUTC = item.allDay ? at(date, 0, 0) : at(date, item.start?.[0] ?? 9, item.start?.[1] ?? 0);
    const endUTC = item.allDay ? at(date, 24, 0) : at(date, item.end?.[0] ?? 10, item.end?.[1] ?? 0);
    return {
      id: `sample-${item.id}-${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      title: item.title,
      kind: item.kind,
      startUTC,
      endUTC,
      allDay: Boolean(item.allDay),
      location: item.location,
      description: item.description,
      calendarColor: item.color,
      smartTag: item.tag,
    };
  });
}

export const SAMPLE_TAGS = [
  {
    id: "classes",
    name: "Classes",
    color: CLASSES.color,
    cover: "Full chip",
    rule: "Title contains MATH or ECE.",
    note: "Lectures and labs take the whole color, so a class reads differently from a personal plan.",
  },
  {
    id: "campus",
    name: "On campus",
    color: CAMPUS.color,
    cover: "Left half",
    rule: "Title or location contains talk, SLC, or STC.",
    note: "The calendar color stays underneath. The tag only paints the left half of the chip.",
  },
  {
    id: "focus",
    name: "Deep work",
    color: FOCUS.color,
    cover: "A quarter",
    rule: "Title contains studio or critique.",
    note: "A small wedge is enough when the block is already on your own calendar.",
  },
] as const;
