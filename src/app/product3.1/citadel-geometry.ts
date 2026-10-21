import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { filmPhase, type BandSpec } from "./citadel-math";

//texture rows: the top TEXT_V..1 holds the engraving, the bottom strip is plain metal
const TEXT_V = 0.25;
const BLANK_V = 0.1;
const TEX_W = 4096;
const TEX_H = 128;

//segments per band: a multiple of every frame count puts a vertex on each polygon corner
const SEGMENTS = 280;

type Face = "front" | "outer" | "back" | "inner";

//box-section ring. group 0 is the outer skin (engraving or film), group 1 the other three faces.
//accent bands map the engraving across the outer face; film bands map one frame per polygon side.
export function createBandGeometry(band: BandSpec): BufferGeometry {
  const r0 = band.radius - band.width / 2;
  const r1 = band.radius + band.width / 2;
  const z0 = -band.depth / 2;
  const z1 = band.depth / 2;
  //frame k spans θ ∈ [k − ½, k + ½]·sector, so u is shifted half a frame and wraps
  const shift = band.film ? 0.5 / band.film.frames : 0;

  //each face is a strip between two (rho, z) corners with a constant (radial, z) normal.
  //flip reverses winding where tangent × (b − a) points into the ring.
  const faces: Record<Face, { a: [number, number]; b: [number, number]; n: [number, number]; flip: boolean }> = {
    outer: { a: [r1, z0], b: [r1, z1], n: [1, 0], flip: false },
    front: { a: [r0, z1], b: [r1, z1], n: [0, 1], flip: true },
    back: { a: [r1, z0], b: [r0, z0], n: [0, -1], flip: true },
    inner: { a: [r0, z1], b: [r0, z0], n: [-1, 0], flip: false },
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const geometry = new BufferGeometry();

  for (const face of Object.keys(faces) as Face[]) {
    const { a, b, n, flip } = faces[face];
    const base = positions.length / 3;
    const start = indices.length;
    for (let k = 0; k <= SEGMENTS; k += 1) {
      const t = k / SEGMENTS;
      const theta = t * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      for (const [rho, z, v] of [
        [a[0], a[1], 0],
        [b[0], b[1], 1],
      ] as const) {
        positions.push(rho * c, rho * s, z);
        normals.push(n[0] * c, n[0] * s, n[1]);
        //outer is read from outside, counterclockwise, bottom to top
        if (face !== "outer") uvs.push(t, BLANK_V);
        else if (band.film) uvs.push(t + shift, v);
        else uvs.push(t, TEXT_V + v * (1 - TEXT_V));
      }
    }
    for (let k = 0; k < SEGMENTS; k += 1) {
      const i = base + k * 2;
      if (flip) indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
      else indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
    }
    geometry.addGroup(start, indices.length - start, face === "outer" ? 0 : 1);
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  //the drum stretches far past the orbit bounds; never cull it
  if (geometry.boundingSphere) geometry.boundingSphere.radius *= 4;
  return geometry;
}

export type BandUniforms = {
  uMorph: { value: number };
  uSides: { value: number };
  uPhase: { value: number };
  //film only: visible fraction of a frame's height, where that slice is centred, lip height, holes per turn
  uWindow: { value: number };
  uWindowCenter: { value: number };
  uEdge: { value: number };
  uHoles: { value: number };
  uFilmBase: { value: Color };
  uBrass: { value: Color };
};

//circle → regular polygon with the same inradius, done per vertex. mirrors polygonFactor() in citadel-math.
const VERTEX_UNIFORMS = /* glsl */ `
uniform float uMorph;
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
  transformed.xy = dir * rho * mix(1.0, 1.0 / cos(citadelEdge(transformed.xy)), uMorph);
}
`;

//film is unlit so the frames read like prints; facing does the shading instead of lights
const FILM_VERTEX = /* glsl */ `
uniform float uWindow;
uniform float uWindowCenter;
varying vec2 vFilm;
varying float vFacing;
`;

const FILM_UV_PATCH = /* glsl */ `
#include <uv_vertex>
vFilm = uv;
//a thin band shows only a slice of each frame; widening the band reveals the rest, undistorted
vMapUv.y = uWindowCenter + (uv.y - 0.5) * uWindow;
`;

const FILM_PROJECT_PATCH = /* glsl */ `
#include <project_vertex>
{
  float turn = -citadelEdge(position.xy) * uMorph;
  vec2 radial = normalize(position.xy);
  vec2 n = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * radial;
  vFacing = dot(normalize(normalMatrix * vec3(n, 0.0)), normalize(-mvPosition.xyz));
}
`;

const FILM_FRAGMENT = /* glsl */ `
uniform float uEdge;
uniform float uHoles;
uniform vec3 uFilmBase;
uniform vec3 uBrass;
varying vec2 vFilm;
varying float vFacing;
`;

const FILM_MAP_PATCH = /* glsl */ `
#include <map_fragment>
{
  //sprocket lips along both edges of the strip, drawn here so they survive any window
  float m = min(vFilm.y, 1.0 - vFilm.y);
  if (m < uEdge) {
    float across = m / uEdge;
    float along = fract(vFilm.x * uHoles);
    float aa = fwidth(along) + 0.01;
    float hole = smoothstep(0.26 - aa, 0.26 + aa, along) * (1.0 - smoothstep(0.7 - aa, 0.7 + aa, along))
      * smoothstep(0.3, 0.36, across) * (1.0 - smoothstep(0.74, 0.8, across));
    vec3 lip = across < 0.14 ? uBrass : uFilmBase;
    diffuseColor.rgb = mix(lip, uBrass * 0.92, hole);
  }
  diffuseColor.rgb *= mix(0.3, 1.0, smoothstep(-0.05, 0.75, vFacing));
}
`;

export function createBandUniforms(band: BandSpec, palette: { film: string; metal: string }): BandUniforms {
  const frames = band.film?.frames ?? 5;
  return {
    uMorph: { value: 0 },
    uSides: { value: frames },
    uPhase: { value: band.film ? filmPhase(band.film) : 0 },
    uWindow: { value: 1 },
    uWindowCenter: { value: 0.5 },
    uEdge: { value: 0.1 },
    uHoles: { value: frames * 6 },
    uFilmBase: { value: new Color(palette.film) },
    uBrass: { value: new Color(palette.metal) },
  };
}

function bend(material: Material, uniforms: BandUniforms, key: string) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_UNIFORMS + shader.vertexShader
      .replace("#include <beginnormal_vertex>", NORMAL_PATCH)
      .replace("#include <begin_vertex>", POSITION_PATCH);
  };
  //every band of one kind shares a program
  material.customProgramCacheKey = () => key;
}

export function createMetalMaterial(band: BandSpec, uniforms: BandUniforms, map?: CanvasTexture): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: map ?? null,
    color: map ? 0xffffff : uniforms.uBrass.value.clone(),
    metalness: 0.86,
    roughness: band.kind === "film" ? 0.3 : 0.36,
    //the film band's lips face the studio floor once the drum stands up; keep them brass, not white
    envMapIntensity: band.kind === "film" ? 0.55 : 1,
    transparent: true,
  });
  bend(material, uniforms, map ? "citadel-engraved" : "citadel-metal");
  return material;
}

export function createFilmMaterial(uniforms: BandUniforms, map: CanvasTexture): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ map, transparent: true, toneMapped: false });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_UNIFORMS + FILM_VERTEX + shader.vertexShader
      .replace("#include <uv_vertex>", FILM_UV_PATCH)
      .replace("#include <begin_vertex>", POSITION_PATCH)
      .replace("#include <project_vertex>", FILM_PROJECT_PATCH);
    shader.fragmentShader = FILM_FRAGMENT + shader.fragmentShader.replace("#include <map_fragment>", FILM_MAP_PATCH);
  };
  material.customProgramCacheKey = () => "citadel-film";
  return material;
}

export function createFilmTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.wrapS = RepeatWrapping;
  return texture;
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
  const faceAspect = (Math.PI * 2 * band.radius) / band.depth;
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
    ctx.globalAlpha = major ? 0.75 : 0.45;
    ctx.lineWidth = major ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, major ? textRows * 0.26 : textRows * 0.16);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = engraving.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(textRows * 0.54)}px ${fontFamily}`;
  for (const label of engraving.labels) {
    const x = label.u * TEX_W;
    //draw twice across the seam so a label at u≈0 is not cut in half
    for (const offset of [0, -TEX_W, TEX_W]) {
      ctx.save();
      ctx.translate(x + offset, textRows * 0.64);
      ctx.scale(squeeze, 1);
      ctx.fillText(label.text, 0, 0);
      ctx.restore();
    }
  }
}

const pad = (value: number) => String(value).padStart(2, "0");

//both accent bands take dark ink on light metal: the old accent-on-brass time band washed out
export function engravingFor(band: BandSpec, palette: { metal: string; pale: string; ink: string }): Engraving {
  if (band.id === "date") {
    return {
      labels: Array.from({ length: 31 }, (_, i) => ({ text: `OCT ${pad(i + 1)} ·`, u: (i + 0.5) / 31 })),
      ticks: 31 * 4,
      majorEvery: 4,
      metal: palette.metal,
      ink: palette.ink,
    };
  }
  return {
    labels: Array.from({ length: 8 }, (_, i) => ({ text: `${pad(i * 3)}:00`, u: (i + 0.5) / 8 })),
    ticks: 24 * 4,
    majorEvery: 4,
    metal: palette.pale,
    ink: palette.ink,
  };
}
