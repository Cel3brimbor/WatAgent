import assert from "node:assert/strict";
import { campusEventsOf, eventInCampusCategory, eventInCampusDepartment } from "./campus-events";

const base = { id: "talk", source: "uw-events", title: "Embedded machine learning", url: "https://uwaterloo.ca/events/talk", allDay: false, startUTC: 1_800_000_000_000, endUTC: 1_800_003_600_000, categories: ["talks"], tags: [] };
const data = campusEventsOf({
  categories: [{ id: "talks", label: "Talks", hint: "" }],
  faculties: [{ id: "engineering", label: "Engineering" }, { id: "mathematics", label: "Mathematics" }],
  departments: [
    { id: "electrical-computer-engineering", label: "Electrical and Computer Engineering", faculties: ["engineering"] },
    { id: "computer-science", label: "Computer Science", faculties: ["mathematics"] },
    { id: "fake-department", label: "Bad faculty", faculties: ["fictional"] },
  ],
  events: [
    { ...base, departmentRelevance: { departments: [
      { id: "electrical-computer-engineering", confidence: 0.96, method: "jev" },
      { id: "computer-science", confidence: 0.9, method: "jev" },
      { id: "computer-science", confidence: 0.9, method: "jev" },
      { id: "unknown", confidence: 1, method: "jev" },
    ], campusWide: false } },
    { ...base, id: "general", departmentRelevance: { departments: [], campusWide: true } },
    { ...base, id: "legacy" },
    { ...base, id: "bad", departmentRelevance: { departments: [
      { id: "computer-science", confidence: 1.1, method: "jev" },
      { id: "computer-science", confidence: 0.79, method: "jev" },
      { id: "computer-science", confidence: 1, method: "invented" },
    ], campusWide: "true" } },
  ],
});
assert.equal(data.departments.length, 2);
const [talk, general, legacy, invalid] = data.events;
assert.equal(talk.departmentRelevance?.departments.length, 2);
assert.equal(eventInCampusDepartment(talk, "electrical-computer-engineering", false), true);
assert.equal(eventInCampusDepartment(talk, "computer-science", false), true);
assert.equal(eventInCampusDepartment(talk, "pharmacy", false), false);
assert.equal(eventInCampusDepartment(general, "computer-science"), true);
assert.equal(eventInCampusDepartment(general, "computer-science", false), false);
assert.equal(eventInCampusDepartment(general, "campus-wide"), true);
assert.equal(eventInCampusDepartment(legacy, "computer-science"), false);
assert.equal(eventInCampusDepartment(legacy, "unclassified"), true);
assert.equal(eventInCampusDepartment(invalid, "unclassified"), true);
assert.equal(eventInCampusDepartment(talk, "unclassified"), false);
assert.equal(eventInCampusDepartment(legacy, ""), true);
assert.equal(eventInCampusCategory(talk, "talks") && eventInCampusDepartment(talk, "computer-science"), true);
assert.equal(eventInCampusCategory(talk, "careers") && eventInCampusDepartment(talk, "computer-science"), false);
assert.deepEqual(campusEventsOf({}).departments, []);
console.log("Campus department filtering checks passed.");
