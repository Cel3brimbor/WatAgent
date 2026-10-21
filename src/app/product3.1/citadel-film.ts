import { AGENT_ITEMS, scenarioOf } from "./agent-reel";
import { FEATURES } from "./feature-reel";
import { filmOf, frameSize, type BandSpec, type ReelId } from "./citadel-math";
import type { AgentScenarioId } from "./product-demo-conversations";

//one strip per film band: frame k holds item k mod n. once the real cards have been photographed,
//each frame is that photograph, so a slide on the side is exactly the card it turns into at the front.
//until then (a second or so) a stand-in holds the frame: the card's own header on its own panel.

export const CELL_W = 512;
//the orbit window hugs the top of each print, where the kicker and title sit
export const HEADER_V = 1;
//brass showing between prints, as a fraction of a cell's width
const GAP = 0.012;

export type FilmPalette = {
  panel: string;
  ink: string;
  soft: string;
  line: string;
  accent: string;
  metal: string;
  engrave: string;
  display: string;
  sans: string;
};

type Frame = { width: number; height: number; scale: number };

export type Prints = (CanvasImageSource | null)[];

export function filmItems(id: ReelId): readonly { id: string; title: string; kicker: string }[] {
  return id === "features" ? FEATURES : AGENT_ITEMS;
}

export function filmCanvasSize(band: BandSpec, maxTexture: number): { width: number; height: number; cell: number } {
  const film = filmOf(band);
  const cell = Math.min(CELL_W, Math.floor(maxTexture / film.frames));
  return { width: cell * film.frames, height: Math.round(cell / film.aspect), cell };
}

export function paintFilm(canvas: HTMLCanvasElement, band: BandSpec, id: ReelId, palette: FilmPalette, prints: Prints) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const film = filmOf(band);
  const items = filmItems(id);
  const width = canvas.width / film.frames;
  const height = canvas.height;
  const frame = { width, height, scale: width / CELL_W };
  const gap = Math.max(2, Math.round(width * GAP));

  ctx.fillStyle = palette.metal;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let k = 0; k < film.frames; k += 1) {
    const index = k % items.length;
    const item = items[index];
    const print = prints[index];
    ctx.save();
    ctx.translate(k * width, 0);
    roundRect(ctx, gap, gap, width - gap * 2, height - gap * 2, 18 * frame.scale);
    ctx.clip();
    if (print) {
      ctx.drawImage(print, gap, gap, width - gap * 2, height - gap * 2);
    } else {
      ctx.fillStyle = palette.panel;
      ctx.fillRect(0, 0, width, height);
      ctx.translate(gap + 20 * frame.scale, gap);
      const inner = { width: width - (gap + 20 * frame.scale) * 2, height: height - gap * 2, scale: frame.scale };
      header(ctx, inner, palette, item.kicker, item.title);
    }
    ctx.restore();
  }
}

//inner skin, read from inside the ring (so it runs mirrored round the band). behind every feature print
//sits its title; behind every assistant print, the prompt that starts its turn, over several lines.
//glyphs are pre-squeezed so they land undistorted once the band is a drum; a thin band shows the middle rows.
export function paintInner(canvas: HTMLCanvasElement, band: BandSpec, id: ReelId, palette: FilmPalette) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const film = filmOf(band);
  const items = filmItems(id);
  const { height: frameHeight } = frameSize(band);
  const innerRadius = band.radius - band.width / 2;
  const squeeze = frameHeight / canvas.height / ((Math.PI * 2 * innerRadius) / canvas.width);
  //the orbit window is band.depth / frameHeight of the rows, centred
  const rows = (band.depth / frameHeight) * canvas.height;
  const mid = canvas.height / 2;
  //one frame's span, in unsqueezed glyph pixels, less a margin each side
  const span = (canvas.width / film.frames / squeeze) * 0.86;

  ctx.fillStyle = palette.metal;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = palette.engrave;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(1, rows * 0.025);
  for (const y of [mid - rows * 0.4, mid + rows * 0.4]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
  ctx.fillStyle = palette.engrave;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const prompt = (index: number) =>
    scenarioOf(items[index].id as AgentScenarioId).messages.find((message) => message.role === "user")?.content ?? items[index].title;

  for (let k = 0; k < film.frames; k += 1) {
    const index = k % items.length;
    const x = (1 - k / film.frames) * canvas.width;
    let lines: string[];
    let size: number;
    if (id === "agents") {
      size = rows * 0.13;
      ctx.font = `500 ${size}px ${palette.sans}`;
      lines = wrapLines(ctx, `“${prompt(index)}”`, span, 5);
    } else {
      size = rows * 0.32;
      ctx.font = `600 ${size}px ${palette.sans}`;
      lines = [items[index].title.toUpperCase().split("").join(String.fromCharCode(8202))];
    }
    const leading = size * 1.22;
    ctx.globalAlpha = 0.9;
    for (const offset of [0, -canvas.width, canvas.width]) {
      lines.forEach((line, i) => {
        ctx.save();
        ctx.translate(x + offset, mid + (i - (lines.length - 1) / 2) * leading);
        ctx.scale(squeeze, 1);
        ctx.fillText(line, 0, 0);
        ctx.restore();
      });
    }
    //a dot between entries, where the prints meet on the far side
    const between = (1 - (k + 0.5) / film.frames) * canvas.width;
    ctx.beginPath();
    ctx.arc(between, mid, rows * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
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
  //ran out of room: the last line ends on an ellipsis
  if (lines.join(" ").length < words.join(" ").length) lines[lines.length - 1] = fit(ctx, `${lines[lines.length - 1]}…`, width);
  return lines;
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
