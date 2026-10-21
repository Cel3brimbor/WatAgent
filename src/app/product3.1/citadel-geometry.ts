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
import { breakCut, type BandSpec } from "./citadel-math";

//texture rows: the top TEXT_V..1 holds the engraving, the bottom strip is plain metal
const TEXT_V = 0.25;
const BLANK_V = 0.1;
const TEX_W = 4096;
const TEX_H = 128;

//segments per band: a multiple of 2 × every frame count, so each break cut and frame edge lands on a vertex
const SEGMENTS = 420;

type Face = "front" | "outer" | "back" | "inner";

//box-section ring built as two half arcs, so it can snap open at the cuts without stretching a triangle.
//groups: 0 the outer skin (engraving or film), 1 the flat lips, 2 the inner skin.
//accent bands carry their engraving on both skins; the inner copy runs mirrored so it reads from inside.
export function createBandGeometry(band: BandSpec): BufferGeometry {
  const r0 = band.radius - band.width / 2;
  const r1 = band.radius + band.width / 2;
  const z0 = -band.depth / 2;
  const z1 = band.depth / 2;
  //frame k is centred on θ = k·sector and spans [k − ½, k + ½]·sector, so u is shifted half a frame
  const shift = band.film ? 0.5 / band.film.frames : 0;
  const cut = breakCut(band);
  const first = Math.round((cut / (Math.PI * 2)) * SEGMENTS);

  //each face is a strip between two (rho, z) corners with a constant (radial, z) normal.
  //flip reverses winding where tangent × (b − a) points into the ring.
  const faces: Record<Face, { a: [number, number]; b: [number, number]; n: [number, number]; flip: boolean }> = {
    outer: { a: [r1, z0], b: [r1, z1], n: [1, 0], flip: false },
    front: { a: [r0, z1], b: [r1, z1], n: [0, 1], flip: true },
    back: { a: [r1, z0], b: [r0, z0], n: [0, -1], flip: true },
    inner: { a: [r0, z1], b: [r0, z0], n: [-1, 0], flip: false },
  };
  const groupOf: Record<Face, number> = { outer: 0, front: 1, back: 1, inner: 2 };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const breaks: number[] = [];
  const indices: number[] = [];
  const geometry = new BufferGeometry();

  for (const face of Object.keys(faces) as Face[]) {
    const { a, b, n, flip } = faces[face];
    const start = indices.length;
    for (let half = 0; half < 2; half += 1) {
      const base = positions.length / 3;
      const from = first + (half * SEGMENTS) / 2;
      //each half flies out along its own midpoint and turns the opposite way to the other
      const mid = cut + Math.PI / 2 + half * Math.PI;
      const spin = half === 0 ? 1 : -1;
      for (let k = from; k <= from + SEGMENTS / 2; k += 1) {
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
          breaks.push(Math.cos(mid), Math.sin(mid), spin);
          //outer reads from outside, counterclockwise, bottom to top; inner reads from inside, so u runs back
          if (face === "outer") uvs.push(band.film ? t + shift : t, band.film ? v : TEXT_V + v * (1 - TEXT_V));
          else if (face === "inner") uvs.push(1 - t, band.film ? 1 - v : TEXT_V + (1 - v) * (1 - TEXT_V));
          else uvs.push(t, BLANK_V);
        }
      }
      for (let k = 0; k < SEGMENTS / 2; k += 1) {
        const i = base + k * 2;
        if (flip) indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
        else indices.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
      }
    }
    geometry.addGroup(start, indices.length - start, groupOf[face]);
  }

  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("aBreak", new Float32BufferAttribute(breaks, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  //the drum and the broken halves reach far past the orbit bounds; never cull them
  if (geometry.boundingSphere) geometry.boundingSphere.radius *= 4;
  return geometry;
}

export type BandUniforms = {
  //0 whole, 1 snapped in two and flown apart
  uBreak: { value: number };
  uSpread: { value: number };
  //film only: visible fraction of a frame's height, where that slice is centred, lip height
  uWindow: { value: number };
  uWindowCenter: { value: number };
  uEdge: { value: number };
  uBrass: { value: Color };
};

const VERTEX_HEAD = /* glsl */ `
uniform float uBreak;
uniform float uSpread;
uniform float uWindow;
uniform float uWindowCenter;
attribute vec3 aBreak;
vec2 citadelTurn(vec2 p) {
  float turn = aBreak.z * uBreak * 0.38;
  float c = cos(turn);
  float s = sin(turn);
  return mat2(c, s, -s, c) * p;
}
`;

const NORMAL_PATCH = /* glsl */ `
#include <beginnormal_vertex>
objectNormal.xy = citadelTurn(objectNormal.xy);
`;

//the halves swing apart in the ring's plane and part along its axis, so every ring breaks its own way
const POSITION_PATCH = /* glsl */ `
#include <begin_vertex>
transformed.xy = citadelTurn(transformed.xy) + aBreak.xy * uBreak * uSpread;
transformed.z += aBreak.z * uBreak * uSpread * 0.35;
`;

//a thin band shows only a slice of each print; widening the band reveals the rest, undistorted
const WINDOW_PATCH = /* glsl */ `
#include <uv_vertex>
vMapUv.y = uWindowCenter + (uv.y - 0.5) * uWindow;
`;

//the inner skin's engraving sits in its middle rows, so its slice stays centred whatever the prints do
const INNER_WINDOW_PATCH = /* glsl */ `
#include <uv_vertex>
vMapUv.y = 0.5 + (uv.y - 0.5) * uWindow;
`;

//film is unlit so the prints read like the cards they are; facing does the shading instead of lights
const FILM_VERTEX = /* glsl */ `
varying vec2 vFilm;
varying float vFacing;
`;

const FILM_UV_PATCH = /* glsl */ `
${WINDOW_PATCH}
vFilm = uv;
`;

const FILM_PROJECT_PATCH = /* glsl */ `
#include <project_vertex>
{
  vec2 n = citadelTurn(normalize(position.xy));
  vFacing = dot(normalize(normalMatrix * vec3(n, 0.0)), normalize(-mvPosition.xyz));
}
`;

const FILM_FRAGMENT = /* glsl */ `
uniform float uEdge;
uniform vec3 uBrass;
varying vec2 vFilm;
varying float vFacing;
`;

const FILM_MAP_PATCH = /* glsl */ `
#include <map_fragment>
{
  //a thin brass lip along both edges: the ring's own metal showing round the prints
  float m = min(vFilm.y, 1.0 - vFilm.y);
  float aa = fwidth(m);
  diffuseColor.rgb = mix(uBrass, diffuseColor.rgb, smoothstep(uEdge - aa, uEdge + aa, m));
  diffuseColor.rgb *= mix(0.3, 1.0, smoothstep(-0.05, 0.75, vFacing));
}
`;

export function createBandUniforms(band: BandSpec, palette: { metal: string }): BandUniforms {
  return {
    uBreak: { value: 0 },
    uSpread: { value: band.radius * 0.9 },
    uWindow: { value: 1 },
    uWindowCenter: { value: 0.5 },
    uEdge: { value: 0.05 },
    uBrass: { value: new Color(palette.metal) },
  };
}

function bend(material: Material, uniforms: BandUniforms, key: string, windowed = false) {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    let vertex = shader.vertexShader
      .replace("#include <beginnormal_vertex>", NORMAL_PATCH)
      .replace("#include <begin_vertex>", POSITION_PATCH);
    if (windowed) vertex = vertex.replace("#include <uv_vertex>", INNER_WINDOW_PATCH);
    shader.vertexShader = VERTEX_HEAD + vertex;
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

//the inner skin of a film band: titles engraved on brass, windowed like the prints so they never stretch
export function createInnerMaterial(uniforms: BandUniforms, map: CanvasTexture): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ map, metalness: 0.8, roughness: 0.38, envMapIntensity: 0.7, transparent: true });
  bend(material, uniforms, "citadel-inner", true);
  return material;
}

export function createFilmMaterial(uniforms: BandUniforms, map: CanvasTexture): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ map, transparent: true, toneMapped: false });
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERTEX_HEAD + FILM_VERTEX + shader.vertexShader
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

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

//both accent bands take dark ink on light metal: the old accent-on-brass time band washed out.
//the date band carries months: a dozen big labels read while it spins, thirty-one small ones never did.
export function engravingFor(band: BandSpec, palette: { metal: string; pale: string; ink: string }): Engraving {
  if (band.id === "date") {
    return {
      labels: MONTHS.map((text, i) => ({ text, u: (i + 0.5) / 12 })),
      ticks: 12 * 4,
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
