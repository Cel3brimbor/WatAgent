"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Mesh, MeshStandardMaterial, PMREMGenerator, Quaternion, type CanvasTexture } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AGENT_ITEMS } from "./agent-reel";
import { FEATURES } from "./feature-reel";
import {
  BANDS,
  FOV,
  SPHERE_RADIUS,
  fitDistance,
  lerp,
  orbitQuaternion,
  thickScale,
  type BandId,
  type BandSpec,
} from "./citadel-math";
import { createBandGeometry, createBandMaterial, createEngravingTexture, engravingFor, paintEngraving, type BandUniforms } from "./citadel-geometry";
import { writeFlight, type FlightRegistry, type Rig } from "./citadel-rig";

//the outer band at rest plus a little air; morph corners may brush the edge as they fade
const FRAME_EXTENT = 2.08;
//outer pentagon corner over the resting extent: (R + W·MAX_THICK/2) / cos(36°) / FRAME_EXTENT
const MORPH_DOLLY = 1.2;
const BRASS = "#c9ad7a";
const ENGRAVE = "#2b2219";

type Props = {
  rig: MutableRefObject<Rig>;
  registry: FlightRegistry;
  running: boolean;
};

export default function CitadelScene({ rig, registry, running }: Props) {
  return (
    <Canvas
      frameloop={running ? "always" : "never"}
      dpr={[1, 1.5]}
      gl={{ powerPreference: "high-performance", precision: "highp", antialias: true, alpha: true }}
      camera={{ fov: FOV, near: 0.1, far: 60, position: [0, 0, 8] }}
      aria-hidden="true"
    >
      <Citadel rig={rig} registry={registry} running={running} />
    </Canvas>
  );
}

type LiveBand = {
  spec: BandSpec;
  uniforms: BandUniforms;
  material: MeshStandardMaterial;
  texture: CanvasTexture;
  geometry: ReturnType<typeof createBandGeometry>;
  angleA: number;
  angleB: number;
  repaint: (font: string) => void;
};

function cssToken(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function slideTitles(id: BandId): string[] {
  if (id === "features") return FEATURES.map((item) => item.title);
  if (id === "agents") return AGENT_ITEMS.map((item) => item.title);
  return [];
}

function Citadel({ rig, registry, running }: Props) {
  //a frame already queued when the loop stops must not write over the settled layout
  const live = useRef(running);
  live.current = running;
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const setDpr = useThree((state) => state.setDpr);
  const meshes = useRef<Partial<Record<BandId, Mesh>>>({});
  const sphere = useRef<Mesh>(null);
  const quaternions = useMemo(
    () => Object.fromEntries(BANDS.map((band) => [band.id, new Quaternion()])) as Record<BandId, Quaternion>,
    [],
  );

  const bands = useMemo<LiveBand[]>(() => {
    const palette = { metal: BRASS, ink: ENGRAVE, accent: cssToken("--accent", "#c2593b") };
    const font = getComputedStyle(document.body).fontFamily || "sans-serif";
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return BANDS.map((spec, index) => {
      const engraving = engravingFor(spec, slideTitles(spec.id), palette);
      const texture = createEngravingTexture(spec, engraving, font, anisotropy);
      const { material, uniforms } = createBandMaterial(spec, texture);
      return {
        spec,
        uniforms,
        material,
        texture,
        geometry: createBandGeometry(spec),
        //phase offsets so no two bands start coplanar
        angleA: 0.7 * index + 0.4,
        angleB: 1.3 * index,
        repaint: (nextFont: string) => {
          paintEngraving(texture.image as HTMLCanvasElement, spec, engraving, nextFont);
          texture.needsUpdate = true;
        },
      };
    });
  }, [gl]);

  useEffect(() => {
    let live = true;
    void document.fonts.ready.then(() => {
      if (!live) return;
      const font = getComputedStyle(document.body).fontFamily || "sans-serif";
      for (const band of bands) band.repaint(font);
    });
    return () => {
      live = false;
      for (const band of bands) {
        band.geometry.dispose();
        band.material.dispose();
        band.texture.dispose();
      }
    };
  }, [bands]);

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

  const baseDistance = useRef(8);

  useEffect(() => {
    baseDistance.current = fitDistance(FRAME_EXTENT, size.width / Math.max(1, size.height));
    camera.position.set(0, 0, baseDistance.current);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    //fill rate: a phone does not need more than one pixel per css pixel here
    setDpr(window.innerWidth < 760 ? 1 : Math.min(1.5, window.devicePixelRatio));
  }, [camera, size, setDpr]);

  useFrame((_, delta) => {
    if (!live.current) return;
    const r = rig.current;
    //a backgrounded tab returns with a huge delta; never jump the orbit
    const step = Math.min(delta, 1 / 20);
    for (const band of bands) {
      const { orbit } = band.spec;
      band.angleA += step * orbit.speedA * r.spin;
      band.angleB += step * orbit.speedB * r.spin;
      const mesh = meshes.current[band.spec.id];
      const q = quaternions[band.spec.id];
      orbitQuaternion(orbit, band.angleA, band.angleB, r.align, q);
      band.uniforms.uMorph.value = r.morph;
      band.uniforms.uThick.value = thickScale(band.spec, r.thick);
      const opacity = band.spec.kind === "accent" ? r.accent * r.ring : r.ring;
      band.material.opacity = opacity;
      if (mesh) {
        mesh.quaternion.copy(q);
        mesh.visible = opacity > 0.01;
      }
    }
    //dolly out as corners grow, so the thick pentagon still fits the frame
    camera.position.z = baseDistance.current * lerp(1, MORPH_DOLLY, r.morph * (0.5 + 0.5 * r.thick));
    const core = sphere.current;
    if (core) {
      //the shell flattens into the plane of the 2D mockup as the iris opens
      core.scale.set(1, 1, lerp(1, 0.04, r.lens));
      (core.material as MeshStandardMaterial).opacity = r.ring * (1 - r.lens);
      core.visible = r.lens < 0.995;
    }
    writeFlight(registry, r, camera, gl.domElement.getBoundingClientRect(), quaternions);
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 4, 6]} intensity={1.7} />
      <directionalLight position={[-4, -2, 3]} intensity={0.5} />
      {bands.map((band) => (
        <mesh
          key={band.spec.id}
          ref={(node) => {
            if (node) meshes.current[band.spec.id] = node;
            else delete meshes.current[band.spec.id];
          }}
          geometry={band.geometry}
          material={band.material}
        />
      ))}
      <mesh ref={sphere}>
        <sphereGeometry args={[SPHERE_RADIUS, 48, 32]} />
        <meshStandardMaterial color={BRASS} metalness={0.92} roughness={0.26} transparent />
      </mesh>
    </>
  );
}
