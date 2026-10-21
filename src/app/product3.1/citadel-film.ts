import { AGENT_ITEMS, scenarioOf } from "./agent-reel";
import { FEATURES, type FeatureId } from "./feature-reel";
import { SAMPLE_TAGS, sampleItems } from "./sample-calendar";
import { filmOf, type BandSpec, type ReelId } from "./citadel-math";

//one strip per film band: frame k holds item k mod n, painted like the card it opens into.
//the header sits high in each frame; a thin band shows just that slice, the open drum shows it all.

export const CELL_W = 512;
//header centre, as v from the bottom of a frame. the orbit window is centred here.
export const HEADER_V = 0.85;

export type FilmPalette = {
  film: string;
  panel: string;
  ink: string;
  soft: string;
  line: string;
  accent: string;
  metal: string;
  display: string;
  sans: string;
};

type Frame = { width: number; height: number; scale: number };

type Painter = (ctx: CanvasRenderingContext2D, frame: Frame, palette: FilmPalette) => void;

const DEMO_WEDNESDAY = new Date(2026, 9, 7);
const DEMO_THURSDAY = new Date(2026, 9, 8);
const DEMO_FRIDAY = new Date(2026, 9, 9);

export function filmItems(id: ReelId): readonly { id: string; title: string; kicker: string }[] {
  return id === "features" ? FEATURES : AGENT_ITEMS;
}

export function filmCanvasSize(band: BandSpec, maxTexture: number): { width: number; height: number; cell: number } {
  const film = filmOf(band);
  const cell = Math.min(CELL_W, Math.floor(maxTexture / film.frames));
  return { width: cell * film.frames, height: Math.round(cell / film.aspect), cell };
}

export function paintFilm(canvas: HTMLCanvasElement, band: BandSpec, id: ReelId, palette: FilmPalette) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const film = filmOf(band);
  const items = filmItems(id);
  const width = canvas.width / film.frames;
  const height = canvas.height;
  const frame = { width, height, scale: width / CELL_W };

  ctx.fillStyle = palette.film;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let k = 0; k < film.frames; k += 1) {
    const item = items[k % items.length];
    ctx.save();
    ctx.translate(k * width, 0);
    //the gate: a dark gap between prints, then the card itself
    const inset = 14 * frame.scale;
    const top = 26 * frame.scale;
    roundRect(ctx, inset, top, width - inset * 2, height - top * 2, 22 * frame.scale);
    ctx.fillStyle = palette.panel;
    ctx.fill();
    ctx.lineWidth = 2 * frame.scale;
    ctx.strokeStyle = palette.metal;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(inset + 26 * frame.scale, top);
    const inner = { width: width - (inset + 26 * frame.scale) * 2, height: height - top * 2, scale: frame.scale };
    header(ctx, inner, palette, item.kicker, item.title);
    const body = id === "features" ? FEATURE_PAINTERS[item.id as FeatureId] : agentPainter(item.id);
    ctx.translate(0, 150 * frame.scale);
    body(ctx, { ...inner, height: inner.height - 170 * frame.scale }, palette);
    ctx.restore();

    //frame number, like the edge print on a negative
    ctx.fillStyle = palette.metal;
    ctx.globalAlpha = 0.7;
    ctx.font = `600 ${11 * frame.scale}px ${palette.sans}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`${String((k % items.length) + 1).padStart(2, "0")}A`, width - inset - 14 * frame.scale, height - top - 12 * frame.scale);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function header(ctx: CanvasRenderingContext2D, frame: Frame, palette: FilmPalette, kicker: string, title: string) {
  const s = frame.scale;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.soft;
  ctx.font = `600 ${15 * s}px ${palette.sans}`;
  spaced(ctx, kicker.toUpperCase(), 0, 52 * s, 2.2 * s);
  ctx.fillStyle = palette.ink;
  ctx.font = `500 ${46 * s}px ${palette.display}`;
  ctx.fillText(fit(ctx, title, frame.width), 0, 104 * s);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(0, 128 * s);
  ctx.lineTo(frame.width, 128 * s);
  ctx.stroke();
}

const FEATURE_PAINTERS: Record<FeatureId, Painter> = {
  tags(ctx, frame, palette) {
    const s = frame.scale;
    lead(ctx, frame, palette, "A word paints the chip.");
    let y = 64 * s;
    for (const tag of SAMPLE_TAGS) {
      dot(ctx, 8 * s, y - 6 * s, 7 * s, tag.color);
      text(ctx, tag.name, 26 * s, y, `600 ${19 * s}px ${palette.sans}`, palette.ink);
      text(ctx, tag.cover, frame.width, y, `${16 * s}px ${palette.sans}`, palette.soft, "right");
      y += 42 * s;
    }
    y += 10 * s;
    const covers = [1, 0.5, 0.25];
    SAMPLE_TAGS.forEach((tag, i) => {
      chip(ctx, 0, y, frame.width, 44 * s, "#5b8a72", tag.color, covers[i], ["MATH 117 lecture", "Talk · STC 1012", "Studio critique"][i], palette, s);
      y += 54 * s;
    });
  },
  events(ctx, frame, palette) {
    const s = frame.scale;
    lead(ctx, frame, palette, "A talk sits beside class.");
    let y = 52 * s;
    const items = [...sampleItems(DEMO_WEDNESDAY), ...sampleItems(DEMO_THURSDAY)].filter((item) => item.kind === "event" && !item.allDay).slice(0, 5);
    for (const item of items) {
      const start = new Date(item.startUTC);
      const clock = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      text(ctx, clock, 0, y + 28 * s, `600 ${14 * s}px ${palette.sans}`, palette.soft);
      chip(ctx, 84 * s, y, frame.width - 84 * s, 44 * s, item.calendarColor ?? palette.accent, item.smartTag?.color, coverOf(item.smartTag?.cover), item.title, palette, s);
      y += 54 * s;
    }
  },
  rules(ctx, frame, palette) {
    const s = frame.scale;
    text(ctx, "ON · THEY RUN IN THE APP", 0, 30 * s, `600 ${14 * s}px ${palette.sans}`, palette.soft);
    const rules = [
      ["Classes onto the week", "Course schedule → Personal"],
      ["Talks worth the walk", "Campus → Personal"],
      ["Ask before writing", "Every rule, every time"],
    ];
    let y = 78 * s;
    for (const [title, meta] of rules) {
      text(ctx, title, 0, y, `600 ${19 * s}px ${palette.sans}`, palette.ink);
      text(ctx, meta, 0, y + 24 * s, `${15 * s}px ${palette.sans}`, palette.soft);
      toggle(ctx, frame.width - 44 * s, y - 16 * s, s, palette);
      rule(ctx, y + 44 * s, frame.width, palette, s);
      y += 76 * s;
    }
  },
  calendars(ctx, frame, palette) {
    const s = frame.scale;
    lead(ctx, frame, palette, "Each source keeps its color.");
    const sources = [
      ["Course schedule", "Imported", "#3d6b8c"],
      ["Personal", "WatAgent", "#5b8a72"],
      ["Google Calendar", "Connected", "#b0600f"],
    ];
    let y = 70 * s;
    for (const [name, meta, color] of sources) {
      roundRect(ctx, 0, y - 22 * s, 30 * s, 30 * s, 7 * s);
      ctx.fillStyle = color;
      ctx.fill();
      text(ctx, name, 46 * s, y - 2 * s, `600 ${19 * s}px ${palette.sans}`, palette.ink);
      text(ctx, meta, frame.width, y - 2 * s, `${15 * s}px ${palette.sans}`, palette.soft, "right");
      rule(ctx, y + 20 * s, frame.width, palette, s);
      y += 58 * s;
    }
    //three lanes merging into one week
    const lanes = ["#3d6b8c", "#5b8a72", "#b0600f"];
    lanes.forEach((color, i) => {
      roundRect(ctx, i * (frame.width / 3) + 4 * s, y, frame.width / 3 - 8 * s, 14 * s, 7 * s);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  },
  tasks(ctx, frame, palette) {
    const s = frame.scale;
    lead(ctx, frame, palette, "A checkbox, on the task color.");
    let y = 56 * s;
    const tasks = [DEMO_THURSDAY, DEMO_FRIDAY].flatMap((date) => sampleItems(date).filter((item) => item.kind === "task")).slice(0, 5);
    tasks.forEach((task, i) => {
      const done = i === 0;
      chip(ctx, 0, y, frame.width, 44 * s, task.calendarColor ?? palette.accent, undefined, 0, task.title, palette, s, done ? "check" : "box");
      y += 54 * s;
    });
  },
};

function agentPainter(id: string): Painter {
  return (ctx, frame, palette) => {
    const s = frame.scale;
    const messages = scenarioOf(id as (typeof AGENT_ITEMS)[number]["id"]).messages;
    const user = messages.find((message) => message.role === "user");
    const assistant = messages.find((message) => message.role === "assistant");
    let y = 8 * s;
    if (user) {
      ctx.font = `${16 * s}px ${palette.sans}`;
      const lines = wrapLines(ctx, user.content, frame.width * 0.78 - 28 * s, 3);
      const boxH = lines.length * 22 * s + 24 * s;
      const boxW = Math.min(frame.width * 0.78, Math.max(...lines.map((line) => ctx.measureText(line).width)) + 28 * s);
      roundRect(ctx, frame.width - boxW, y, boxW, boxH, 14 * s);
      ctx.fillStyle = palette.film;
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      lines.forEach((line, i) => text(ctx, line, frame.width - boxW + 14 * s, y + 28 * s + i * 22 * s, `${16 * s}px ${palette.sans}`, palette.ink));
      y += boxH + 22 * s;
    }
    text(ctx, "WATAGENT", 0, y, `600 ${13 * s}px ${palette.sans}`, palette.soft);
    y += 14 * s;
    const calls = (assistant?.activity ?? []).flatMap((part) => (part.kind === "tools" ? part.events : [])).slice(0, 2);
    for (const call of calls) {
      ctx.font = `${13 * s}px ui-monospace, Menlo, monospace`;
      const label = fit(ctx, `✓ ${call.callLabel ?? call.tool}`, frame.width - 20 * s);
      roundRect(ctx, 0, y, Math.min(frame.width, ctx.measureText(label).width + 20 * s), 28 * s, 8 * s);
      ctx.fillStyle = palette.film;
      ctx.globalAlpha = 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
      text(ctx, label, 10 * s, y + 19 * s, ctx.font, palette.soft);
      y += 36 * s;
    }
    y += 12 * s;
    const answer = (assistant?.content ?? "").replace(/\*\*/g, "").replace(/^\s*[-*]\s+/gm, "· ").replace(/\n{2,}/g, "\n");
    ctx.font = `${16 * s}px ${palette.sans}`;
    const room = Math.max(1, Math.floor((frame.height - y) / (23 * s)));
    const lines = answer.split("\n").flatMap((paragraph) => wrapLines(ctx, paragraph, frame.width, 4));
    lines.slice(0, room).forEach((line, i) => {
      const last = i === room - 1 && lines.length > room;
      text(ctx, last ? `${line.replace(/\s*\S*$/, "")} …` : line, 0, y + i * 23 * s, `${16 * s}px ${palette.sans}`, palette.ink);
    });
  };
}

function coverOf(cover?: "full" | "half" | "quarter"): number {
  return cover === "full" ? 1 : cover === "half" ? 0.5 : cover === "quarter" ? 0.25 : 0;
}

function lead(ctx: CanvasRenderingContext2D, frame: Frame, palette: FilmPalette, value: string) {
  text(ctx, value, 0, 22 * frame.scale, `italic ${18 * frame.scale}px ${palette.display}`, palette.soft);
}

//a calendar chip: calendar color underneath, a tag paints a share of it from the left
function chip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  tag: string | undefined,
  cover: number,
  label: string,
  palette: FilmPalette,
  s: number,
  box?: "box" | "check",
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 8 * s);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.globalAlpha = 0.32;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  if (tag && cover > 0) {
    ctx.fillStyle = tag;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x, y, w * cover, h);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = base;
  ctx.fillRect(x, y, 5 * s, h);
  ctx.restore();
  let textX = x + 16 * s;
  if (box) {
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(x + 16 * s, y + h / 2 - 8 * s, 16 * s, 16 * s);
    if (box === "check") {
      ctx.beginPath();
      ctx.moveTo(x + 19 * s, y + h / 2);
      ctx.lineTo(x + 23 * s, y + h / 2 + 4 * s);
      ctx.lineTo(x + 30 * s, y + h / 2 - 5 * s);
      ctx.stroke();
    }
    textX += 28 * s;
  }
  ctx.font = `600 ${16 * s}px ${palette.sans}`;
  text(ctx, fit(ctx, label, w - (textX - x) - 10 * s), textX, y + h / 2 + 6 * s, ctx.font, palette.ink);
}

function toggle(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, palette: FilmPalette) {
  roundRect(ctx, x, y, 44 * s, 24 * s, 12 * s);
  ctx.fillStyle = palette.accent;
  ctx.fill();
  dot(ctx, x + 32 * s, y + 12 * s, 9 * s, palette.panel);
}

function rule(ctx: CanvasRenderingContext2D, y: number, width: number, palette: FilmPalette, s: number) {
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(value, x, y);
}

function spaced(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, tracking: number) {
  let cursor = x;
  for (const char of value) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}

function fit(ctx: CanvasRenderingContext2D, value: string, width: number): string {
  if (ctx.measureText(value).width <= width) return value;
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function wrapLines(ctx: CanvasRenderingContext2D, value: string, width: number, max: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === max) break;
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && words.join(" ").length > lines.join(" ").length) lines[max - 1] = fit(ctx, `${lines[max - 1]}…`, width);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
