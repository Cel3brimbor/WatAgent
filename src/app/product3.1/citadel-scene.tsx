"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { stepDial } from "./citadel-dial";
import { HEADER_V, filmCanvasSize, paintFilm, paintInner, type FilmPalette } from "./citadel-film";
import {
  BANDS,
  DRUM_LEAN,
  FOV,
  SPHERE_RADIUS,
  clamp01,
  drumQuaternion,
  drumSpin,
  drumStretch,
  filmOf,
  fitDistance,
  focalPx,
  frameSize,
  lerp,
  orbitQuaternion,
  silhouettePx,
  smoothstep,
  type BandSpec,
  type ReelId,
} from "./citadel-math";
import {
  createBandGeometry,
  createBandUniforms,
  createEngravingTexture,
  createFilmMaterial,
  createFilmTexture,
  createInnerMaterial,
  createMetalMaterial,
  engravingFor,
  paintEngraving,
  type BandUniforms,
} from "./citadel-geometry";
import { drumShot, writeCards, writeLens, type Dials, type Rig, type StageDom, type View } from "./citadel-rig";

//the outer band at rest plus a little air
const FRAME_EXTENT = 2.08;
//the astrolabe between beats sits a touch inside the frame
const CENTER_SCALE = 0.9;
const METAL = "#c9ad7a";
const PALE = "#e8d9b2";
const ENGRAVE = "#2b2219";
//brass lip round the prints, in band units
const LIP = 0.016;
//inner skin texture: one turn of engraved titles
const INNER_W = 4096;
const INNER_H = 512;

type Props = {
  rig: MutableRefObject<Rig>;
  dom: StageDom;
  dials: Dials;
  running: boolean;
};

export default function CitadelScene({ rig, dom, dials, running }: Props) {
  return (
    <Canvas
      frameloop={running ? "always" : "never"}
      dpr={[1, 1.5]}
      gl={{ powerPreference: "high-performance", antialias: true, alpha: true }}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 0, 8] }}
      aria-hidden="true"
    >
      <Citadel rig={rig} dom={dom} dials={dials} running={running} />
    </Canvas>
  );
}

type LiveBand = {
  spec: BandSpec;
  uniforms: BandUniforms;
  materials: Material[];
  textures: CanvasTexture[];
  geometry: BufferGeometry;
  angleA: number;
  angleB: number;
  repaint: () => void;
  //film bands: which batch of card photographs is on the strip
  printed: number;
};

function token(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

function readPalette(): FilmPalette {
  const styles = getComputedStyle(document.body);
  return {
    panel: token(styles, "--panel-solid", "#1f1c18"),
    ink: token(styles, "--ink", "#ece6dc"),
    soft: token(styles, "--ink-soft", "#a39a8c"),
    line: token(styles, "--line", "rgba(236, 230, 220, 0.12)"),
    accent: token(styles, "--accent", "#e07a5a"),
    metal: METAL,
    engrave: ENGRAVE,
    display: token(styles, "--font-display", "Georgia, serif"),
    sans: styles.fontFamily || "sans-serif",
  };
}

const heroPos = new Vector3();
const groupPos = new Vector3();
const drumPos = new Vector3();
const bandPos = new Vector3();
const projected = new Vector3();
const drumQ = new Quaternion();

function Citadel({ rig, dom, dials, running }: Props) {
  //a frame already queued when the loop stops must not write over the page
  const live = useRef(running);
  live.current = running;
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const setDpr = useThree((state) => state.setDpr);
  const group = useRef<Group>(null);
  const meshes = useRef<Partial<Record<BandSpec["id"], Mesh>>>({});
  const occluder = useRef<Mesh>(null);
  const rim = useRef<Mesh>(null);
  const rimMaterial = useMemo(() => new MeshStandardMaterial({ color: METAL, metalness: 0.92, roughness: 0.26, transparent: true }), []);
  //depth only: hides the far side of every band behind the sphere while the calendar shows through
  const occluderMaterial = useMemo(() => new MeshBasicMaterial({ colorWrite: false }), []);
  const orbit = useMemo(() => Object.fromEntries(BANDS.map((band) => [band.id, new Quaternion()])) as Record<BandSpec["id"], Quaternion>, []);

  const bands = useMemo<LiveBand[]>(() => {
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    const maxTexture = gl.capabilities.maxTextureSize;
    return BANDS.map((spec, index) => {
      const uniforms = createBandUniforms(spec, { metal: METAL });
      //phase offsets so no two bands start coplanar
      const angles = { angleA: 0.7 * index + 0.4, angleB: 1.3 * index };
      if (spec.kind === "accent") {
        const engraving = engravingFor(spec, { metal: METAL, pale: PALE, ink: ENGRAVE });
        const font = getComputedStyle(document.body).fontFamily || "sans-serif";
        const texture = createEngravingTexture(spec, engraving, font, anisotropy);
        const material = createMetalMaterial(spec, uniforms, texture);
        return {
          spec,
          uniforms,
          materials: [material, material, material],
          textures: [texture],
          geometry: createBandGeometry(spec),
          ...angles,
          printed: 0,
          repaint: () => {
            paintEngraving(texture.image as HTMLCanvasElement, spec, engraving, getComputedStyle(document.body).fontFamily || "sans-serif");
            texture.needsUpdate = true;
          },
        };
      }
      const reel = spec.id as ReelId;
      const canvas = document.createElement("canvas");
      const dims = filmCanvasSize(spec, maxTexture);
      canvas.width = dims.width;
      canvas.height = dims.height;
      paintFilm(canvas, spec, reel, readPalette(), dom.prints[reel]);
      const texture = createFilmTexture(canvas, anisotropy);
      const innerCanvas = document.createElement("canvas");
      innerCanvas.width = Math.min(INNER_W, maxTexture);
      innerCanvas.height = INNER_H;
      paintInner(innerCanvas, spec, reel, readPalette());
      const inner = createFilmTexture(innerCanvas, anisotropy);
      return {
        spec,
        uniforms,
        materials: [createFilmMaterial(uniforms, texture), createMetalMaterial(spec, uniforms), createInnerMaterial(uniforms, inner)],
        textures: [texture, inner],
        geometry: createBandGeometry(spec),
        ...angles,
        printed: dom.printVersion[reel],
        repaint: () => {
          const palette = readPalette();
          paintFilm(canvas, spec, reel, palette, dom.prints[reel]);
          texture.needsUpdate = true;
          paintInner(innerCanvas, spec, reel, palette);
          inner.needsUpdate = true;
        },
      };
    });
  }, [gl, dom]);

  useEffect(() => {
    let alive = true;
    void document.fonts.ready.then(() => {
      if (!alive) return;
      for (const band of bands) band.repaint();
    });
    return () => {
      alive = false;
      for (const band of bands) {
        band.geometry.dispose();
        for (const material of new Set(band.materials)) material.dispose();
        for (const texture of band.textures) texture.dispose();
      }
    };
  }, [bands]);

  useEffect(
    () => () => {
      rimMaterial.dispose();
      occluderMaterial.dispose();
    },
    [rimMaterial, occluderMaterial],
  );

  //procedural studio light, no HDR fetch
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  const view = useRef<View>({ width: 1, height: 1, focal: 1, distance: 8 });

  useEffect(() => {
    const distance = fitDistance(FRAME_EXTENT, size.width / Math.max(1, size.height));
    const focal = focalPx(size.height);
    view.current = { width: size.width, height: size.height, focal, distance };
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    //the card layers share the camera's lens, so css perspective is the focal length in px
    for (const layer of Object.values(dom.layers)) layer?.style.setProperty("perspective", `${focal.toFixed(1)}px`);
    const { framePx } = drumShot(view.current);
    for (const band of BANDS) {
      if (band.kind !== "film") continue;
      const layer = dom.layers[band.id as ReelId];
      layer?.style.setProperty("--card-w", `${framePx}px`);
      layer?.style.setProperty("--card-h", `${Math.round(framePx / filmOf(band).aspect)}px`);
      dials[band.id as ReelId].framePx = framePx;
    }
    //fill rate: a phone does not need more than one pixel per css pixel here
    setDpr(window.innerWidth < 760 ? 1 : Math.min(1.5, window.devicePixelRatio));
  }, [camera, size, setDpr, dom, dials]);

  useFrame((_, delta) => {
    if (!live.current) return;
    const r = rig.current;
    const v = view.current;
    //a backgrounded tab returns with a huge delta; never jump the orbit
    const step = Math.min(delta, 1 / 20);
    const ppu = v.focal / v.distance;

    //hero: the astrolabe sits right of the copy (or under it when stacked), then glides to the middle
    const desktop = v.width >= 1100;
    const anchorX = desktop ? v.width * 0.66 : v.width * 0.5;
    //the nav sits above the stage until it sticks, so the visible stage is ~80px short
    const anchorY = desktop ? (v.height - 80) / 2 : v.height * 0.7;
    const limit = desktop ? Math.min(v.width * 0.32, (v.height - 80) * 0.46) : Math.min(v.width * 0.44, v.height * 0.19);
    const heroScale = Math.min(1, limit / (FRAME_EXTENT * ppu));
    heroPos.set((anchorX - v.width / 2) / ppu, -(anchorY - v.height / 2) / ppu, 0);
    groupPos.copy(heroPos).multiplyScalar(1 - r.center);
    groupPos.y += r.exit * 0.6;
    const groupScale = lerp(heroScale, CENTER_SCALE, r.center) * lerp(1, 0.55, r.exit);

    const open = Math.max(r.features, r.agents);
    const fade = 1 - r.exit;
    const sphereAlpha = (1 - smoothstep(0, 0.5, r.lens)) * (1 - smoothstep(0, 0.7, open)) * fade;
    //the rings snap open to let the calendar out, drift apart, then fade; closing reverses it and they rejoin
    const broken = smoothstep(0.02, 0.62, r.lens);
    const ringAlpha = (1 - smoothstep(0.42, 0.92, r.lens)) * fade;

    const g = group.current;
    if (g) {
      g.position.copy(groupPos);
      g.scale.setScalar(groupScale);
    }
    if (occluder.current) occluder.current.visible = sphereAlpha > 0.5;
    if (rim.current) {
      rimMaterial.opacity = sphereAlpha;
      rim.current.visible = sphereAlpha > 0.01;
    }

    const shot = drumShot(v);
    for (const band of bands) {
      const { spec } = band;
      const mesh = meshes.current[spec.id];
      band.angleA += step * spec.orbit.speedA;
      band.angleB += step * spec.orbit.speedB;
      const q = orbit[spec.id];
      orbitQuaternion(spec.orbit, band.angleA, band.angleB, q);

      band.uniforms.uBreak.value = broken;
      if (spec.kind === "accent") {
        const alpha = ringAlpha * (1 - smoothstep(0, 0.6, open));
        for (const material of band.materials) material.opacity = alpha;
        if (mesh) {
          mesh.quaternion.copy(q);
          mesh.visible = alpha > 0.01;
        }
        continue;
      }

      const reel = spec.id as ReelId;
      const mine = r[reel];
      const other = reel === "features" ? r.agents : r.features;
      const dial = dials[reel];
      stepDial(dial, step);
      const film = filmOf(spec);
      const frame = frameSize(spec);

      //the open drum: front frame `framePx` wide, centred at shot.centerY
      const distanceToFace = (frame.width * v.focal) / shot.framePx;
      const faceZ = v.distance - distanceToFace;
      const faceY = (-(shot.centerY - v.height / 2) * distanceToFace) / v.focal;
      const lean = DRUM_LEAN - Math.PI / 2;
      drumPos.set(0, faceY + frame.inradius * Math.cos(lean), faceZ + frame.inradius * Math.sin(lean));
      drumQuaternion(drumSpin(film, dial.pose), drumQ);

      //new card photographs: repaint the strip once per batch
      if (band.printed !== dom.printVersion[reel]) {
        band.printed = dom.printVersion[reel];
        band.repaint();
      }

      //turn first, then widen into a drum; the strip stays round, its prints bent along it
      const turn = mine;
      const widen = smoothstep(0.12, 0.88, mine);
      const scale = lerp(groupScale, 1, turn);
      const stretch = lerp(1, drumStretch(spec), widen);
      bandPos.lerpVectors(groupPos, drumPos, turn);
      if (mesh) {
        mesh.position.copy(bandPos);
        mesh.quaternion.copy(q).slerp(drumQ, turn);
        mesh.scale.set(scale, scale, scale * stretch);
      }

      const depth = spec.depth * stretch;
      const window = Math.min(1, depth / frame.height);
      const closed = spec.depth / frame.height;
      const centreV = lerp(HEADER_V, 0.5, clamp01((window - closed) / (1 - closed)));
      const u = band.uniforms;
      u.uWindow.value = window;
      u.uWindowCenter.value = Math.min(1 - window / 2, Math.max(window / 2, centreV));
      u.uEdge.value = Math.min(0.2, LIP / depth);

      const alpha = ringAlpha * (1 - smoothstep(0, 0.6, other)) * lerp(fade, 1, mine);
      for (const material of band.materials) material.opacity = alpha;
      if (mesh) mesh.visible = alpha > 0.01;
      writeCards(dom, reel, spec, dial, mine, bandPos, mesh?.quaternion ?? drumQ, scale, v);
    }

    //where the sphere sits on screen, for the calendar iris
    projected.copy(groupPos).project(camera);
    const distance = camera.position.distanceTo(groupPos);
    writeLens(
      dom,
      v,
      {
        x: (projected.x * v.width) / 2,
        y: (-projected.y * v.height) / 2,
        rim: silhouettePx(v.focal, distance, SPHERE_RADIUS * groupScale),
        alpha: sphereAlpha,
      },
      r.lens,
    );
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 6]} intensity={1.7} />
      <directionalLight position={[-4, -2, 3]} intensity={0.5} />
      <group ref={group}>
        <mesh ref={occluder} material={occluderMaterial} renderOrder={-1}>
          <sphereGeometry args={[SPHERE_RADIUS, 48, 32]} />
        </mesh>
        <mesh ref={rim} material={rimMaterial}>
          <torusGeometry args={[SPHERE_RADIUS * 0.965, SPHERE_RADIUS * 0.045, 16, 96]} />
        </mesh>
        {bands
          .filter((band) => band.spec.kind === "accent")
          .map((band) => (
            <BandMesh key={band.spec.id} band={band} meshes={meshes} />
          ))}
      </group>
      {bands
        .filter((band) => band.spec.kind === "film")
        .map((band) => (
          <BandMesh key={band.spec.id} band={band} meshes={meshes} />
        ))}
    </>
  );
}

function BandMesh({ band, meshes }: { band: LiveBand; meshes: MutableRefObject<Partial<Record<BandSpec["id"], Mesh>>> }) {
  return (
    <mesh
      ref={(node) => {
        if (node) meshes.current[band.spec.id] = node;
        else delete meshes.current[band.spec.id];
      }}
      geometry={band.geometry}
      material={band.materials}
    />
  );
}
