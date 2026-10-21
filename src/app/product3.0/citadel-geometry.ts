import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  MeshStandardMaterial,
  SRGBColorSpace,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { CORNER_PHASE, SIDES, type BandSpec } from "./citadel-math";

//texture rows: the top TEXT_V..1 holds the engraving, the bottom strip is plain metal
const TEXT_V = 0.25;
const BLANK_V = 0.1;
const TEX_W = 4096;
const TEX_H = 128;

//a multiple of 4·SIDES puts a vertex on every pentagon corner and on the top midpoint
const SEGMENTS = SIDES * 32;

type Face = "front" | "outer" | "back" | "inner";

//box-section ring. the engraved face (front for primary, outer for accent) maps u around θ
//and v across the face; the other three faces sample the blank strip.
export function createBandGeometry(band: BandSpec): BufferGeometry {
  const r0 = band.radius - band.width / 2;
  const r1 = band.radius + band.width / 2;
  const z0 = -band.depth / 2;
  const z1 = band.depth / 2;
  const engraved: Face = band.kind === "primary" ? "front" : "outer";

  //each face is a strip between two (rho, z) corners with a constant (radial, z) normal.
  //flip reverses winding where tangent × (b − a) points into the ring.
  const faces: Record<Face, { a: [number, number]; b: [number, number]; n: [number, number]; flip: boolean }> = {
    front: { a: [r0, z1], b: [r1, z1], n: [0, 1], flip: true },
    outer: { a: [r1, z0], b: [r1, z1], n: [1, 0], flip: false },
    back: { a: [r1, z0], b: [r0, z0], n: [0, -1], flip: true },
    inner: { a: [r0, z1], b: [r0, z0], n: [-1, 0], flip: false },
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const face of Object.keys(faces) as Face[]) {
    const { a, b, n, flip } = faces[face];
    const base = positions.length / 3;
    for (let k = 0; k <= SEGMENTS; k += 1) {
      const t = k / SEGMENTS;
      const theta = t * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      //front is read from +z, so text runs clockwise; outer is read from outside, counterclockwise
      const u = face === "front" ? 1 - t : t;
      for (const [rho, z, v] of [
        [a[0], a[1], 0],
        [b[0], b[1], 1],
      ] as const) {
        positions.push(rho * c, rho * s, z);
        normals.push(n[0] * c, n[0] * s, n[1]);
        uvs.push(u, face === engraved ? TEXT_V + v * (1 - TEXT_V) : BLANK_V);
      }
    }
    for (let k = 0; k < SEGMENTS; k += 1) {
      const i = base + k * 2;
      if (flip) indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      else indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export type BandUniforms = {
  uMorph: { value: number };
  uThick: { value: number };
  uRadius: { value: number };
  uSides: { value: number };
  uPhase: { value: number };
};

//circle → regular polygon with the same inradius, done per vertex. mirrors polygonFactor() in citadel-math.
const VERTEX_UNIFORMS = /* glsl */ `
uniform float uMorph;
uniform float uThick;
uniform float uRadius;
uniform float uSides;
uniform float uPhase;
float citadelEdge(vec2 p) {
  float sector = 6.28318530718 / uSides;
  return mod(atan(p.y, p.x) - uPhase, sector) - 0.5 * sector;
}
`;

const NORMAL_PATCH = /* glsl */ `
#include <beginnormal_vertex>
{
  //side faces turn to the polygon edge normal
  float turn = -citadelEdge(position.xy) * uMorph;
  float c = cos(turn);
  float s = sin(turn);
  objectNormal.xy = mat2(c, s, -s, c) * objectNormal.xy;
}
`;

const POSITION_PATCH = /* glsl */ `
#include <begin_vertex>
{
  float rho = length(transformed.xy);
  vec2 dir = transformed.xy / max(rho, 1e-5);
  //each concentric line keeps its own inradius, so the band edges stay parallel and mitred
  float line = uRadius + (rho - uRadius) * uThick;
  transformed.xy = dir * line * mix(1.0, 1.0 / cos(citadelEdge(transformed.xy)), uMorph);
}
`;

export function createBandMaterial(band: BandSpec, map: CanvasTexture): { material: MeshStandardMaterial; uniforms: BandUniforms } {
  const uniforms: BandUniforms = {
    uMorph: { value: 0 },
    uThick: { value: 1 },
    uRadius: { value: band.radius },
    uSides: { value: SIDES },
    uPhase: { value: CORNER_PHASE },
  };
  const material = new MeshStandardMaterial({
    map,
    metalness: band.kind === "primary" ? 0.88 : 0.82,
    roughness: band.kind === "primary" ? 0.32 : 0.36,
    transparent: true,
  });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_UNIFORMS + shader.vertexShader
      .replace("#include <beginnormal_vertex>", NORMAL_PATCH)
      .replace("#include <begin_vertex>", POSITION_PATCH);
  };
  //all four bands share one program
  material.customProgramCacheKey = () => "citadel-band";
  return { material, uniforms };
}

export type Engraving = {
  labels: { text: string; u: number }[];
  ticks: number;
  majorEvery: number;
  metal: string;
  ink: string;
};

//text curve mapping: the face is circumference × faceHeight, the strip is TEX_W × textRows.
//glyphs are pre-squeezed by stripAspect / faceAspect so they land undistorted after the wrap.
export function createEngravingTexture(band: BandSpec, engraving: Engraving, fontFamily: string, anisotropy: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  paintEngraving(canvas, band, engraving, fontFamily);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

//webfonts can arrive after the first paint; call again and flag needsUpdate
export function paintEngraving(canvas: HTMLCanvasElement, band: BandSpec, engraving: Engraving, fontFamily: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");

  const textRows = TEX_H * (1 - TEXT_V);
  const faceHeight = band.kind === "primary" ? band.width : band.depth;
  const faceAspect = (Math.PI * 2 * band.radius) / faceHeight;
  const squeeze = TEX_W / textRows / faceAspect;

  ctx.globalAlpha = 1;
  ctx.fillStyle = engraving.metal;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  //engraved strip sits in canvas rows 0..textRows (v = 1 at the top after flipY)
  ctx.strokeStyle = engraving.ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.lineTo(TEX_W, 6);
  ctx.moveTo(0, textRows - 6);
  ctx.lineTo(TEX_W, textRows - 6);
  ctx.stroke();

  for (let i = 0; i < engraving.ticks; i += 1) {
    const x = (i / engraving.ticks) * TEX_W;
    const major = i % engraving.majorEvery === 0;
    ctx.globalAlpha = major ? 0.7 : 0.4;
    ctx.lineWidth = major ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, major ? textRows * 0.28 : textRows * 0.16);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = engraving.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(textRows * 0.46)}px ${fontFamily}`;
  for (const label of engraving.labels) {
    const x = label.u * TEX_W;
    //draw twice across the seam so a label at u≈0 is not cut in half
    for (const offset of [0, -TEX_W, TEX_W]) {
      ctx.save();
      ctx.translate(x + offset, textRows * 0.62);
      ctx.scale(squeeze, 1);
      ctx.fillText(label.text, 0, 0);
      ctx.restore();
    }
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

//u for a band angle on the face that carries the text
export function uForTheta(band: BandSpec, theta: number): number {
  const t = (((theta / (Math.PI * 2)) % 1) + 1) % 1;
  return band.kind === "primary" ? 1 - t : t;
}

export function engravingFor(band: BandSpec, slideTitles: readonly string[], palette: { metal: string; ink: string; accent: string }): Engraving {
  if (band.id === "date") {
    return {
      labels: Array.from({ length: 31 }, (_, i) => ({ text: `JAN ${pad(i + 1)} ·`, u: (i + 0.5) / 31 })),
      ticks: 31 * 4,
      majorEvery: 4,
      metal: palette.metal,
      ink: palette.ink,
    };
  }
  if (band.id === "time") {
    return {
      labels: Array.from({ length: 6 }, (_, i) => ({ text: `${pad(i * 4)}:00 ·`, u: (i + 0.5) / 6 })),
      ticks: 24 * 4,
      majorEvery: 4,
      metal: palette.metal,
      ink: palette.accent,
    };
  }
  //primary: titles sit between plaques, since the plaques cover the band at θ_i
  const count = slideTitles.length;
  return {
    labels: slideTitles.map((title, i) => ({
      text: title.toUpperCase(),
      u: uForTheta(band, Math.PI / 2 - ((i + 0.5) / count) * Math.PI * 2),
    })),
    ticks: 120,
    majorEvery: 6,
    metal: palette.metal,
    ink: palette.ink,
  };
}
