import type { TimelineItem } from "@/calendar/types";
import { compileSmartTags, type SmartTag, type SmartTagTarget } from "@/calendar/smart-tags";
import { sampleItems } from "./sample-calendar";

//session only. nothing here is written to storage or the api.

export function starterTags(): SmartTag[] {
  const tags: SmartTag[] = [
    {
      id: "tag-classes",
      name: "Classes",
      color: "#3d6b8c",
      enabled: true,
      match: "any",
      cover: "full",
      rules: [{ id: "rule-classes", field: "title", operator: "contains", value: "MATH, ECE" }],
      exemptCalendarIds: [],
    },
    {
      id: "tag-campus",
      name: "On campus",
      color: "#c2593b",
      enabled: true,
      match: "any",
      cover: "half",
      rules: [
        { id: "rule-campus-title", field: "title", operator: "contains", value: "talk, SLC, STC" },
        { id: "rule-campus-place", field: "location", operator: "contains", value: "talk, SLC, STC" },
      ],
      exemptCalendarIds: [],
    },
    {
      id: "tag-focus",
      name: "Deep work",
      color: "#6f8f3a",
      enabled: true,
      match: "any",
      cover: "quarter",
      rules: [{ id: "rule-focus", field: "title", operator: "contains", value: "studio, critique" }],
      exemptCalendarIds: [],
    },
  ];
  return tags.map((tag) => ({ ...tag, rules: tag.rules.map((rule) => ({ ...rule })), exemptCalendarIds: [] }));
}

export function sampleTagTargets(): SmartTagTarget[] {
  //monday 5 oct 2026 through sunday 11, the week the preview opens on
  return Array.from({ length: 7 }, (_, index) => sampleItems(new Date(2026, 9, 5 + index)))
    .flat()
    .map((item) => ({
      calendarId: "sample",
      title: item.title,
      location: item.location,
      description: item.description,
    }));
}

export function paintWithTags(items: TimelineItem[], tags: SmartTag[]): TimelineItem[] {
  const match = compileSmartTags(tags);
  return items.map((item) => {
    const hit = match({
      calendarId: "sample",
      title: item.title,
      location: item.location,
      description: item.description,
    });
    if (!hit) {
      if (!item.smartTag) return item;
      const next = { ...item };
      delete next.smartTag;
      return next;
    }
    return { ...item, smartTag: hit };
  });
}
