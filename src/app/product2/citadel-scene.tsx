"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import {
  R0,
  R1,
  RS,
  TUBE0,
  TUBE1,
  cameraZ,
  facingOpacity,
  plaqueScale,
  projectToViewport,
  thetaAt,
  type CitadelPoses,
  type CitadelRig,
  type FlightPose,
} from "./citadel-math"

type Props = {
  rig: RefObject<CitadelRig>
  poses: RefObject<CitadelPoses>
  featureCount: number
  agentCount: number
  frameloop: "always" | "never"
  hidden: boolean
}

type Scratch = {
  local: THREE.Vector3
  world: THREE.Vector3
  ndc: THREE.Vector3
  dir: THREE.Vector3
  view: THREE.Vector3
  cam: THREE.Vector3
}

const rendererOptions = {
  alpha: true,
  antialias: true,
  premultipliedAlpha: false,
  //dedicated gpu on dual-gpu laptops and phones, and full float precision in the shaders
  powerPreference: "high-performance" as const,
  precision: "highp" as const,
}

function readToken(name: string, fallback: string): string {
  const probe = document.createElement("span")
  probe.style.color = `var(${name})`
  probe.style.position = "absolute"
  probe.style.left = "-9999px"
  document.body.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  return value || fallback
}

function useMetalColors() {
  const [colors, setColors] = useState({ ink: "#1d1b18", paper: "#faf7f2" })
  useEffect(() => {
    const read = () => setColors({ ink: readToken("--ink", "#1d1b18"), paper: readToken("--paper", "#faf7f2") })
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-scheme", "data-tea", "style"] })
    const scheme = window.matchMedia("(prefers-color-scheme: dark)")
    scheme.addEventListener("change", read)
    return () => {
      observer.disconnect()
      scheme.removeEventListener("change", read)
    }
  }, [])
  return colors
}

function mixColors(ink: string, paper: string, towardPaper: number): string {
  const color = new THREE.Color(ink)
  color.lerp(new THREE.Color(paper), towardPaper)
  return `#${color.getHexString()}`
}

function projectOn(
  scratch: Scratch,
  group: THREE.Object3D,
  lx: number,
  ly: number,
  lz: number,
  camera: THREE.Camera,
  rect: DOMRect,
): FlightPose {
  const { local, world, ndc, dir, view, cam } = scratch
  local.set(lx, ly, lz)
  world.copy(local).applyMatrix4(group.matrixWorld)
  ndc.copy(world).project(camera)
  const point = projectToViewport(ndc.x, ndc.y, rect)
  camera.getWorldPosition(cam)
  const dist = cam.distanceTo(world)
  dir.set(lx, ly, lz)
  if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1)
  dir.normalize().transformDirection(group.matrixWorld)
  view.copy(cam).sub(world)
  const len = view.length()
  if (len > 1e-6) view.multiplyScalar(1 / len)
  return {
    x: point.x,
    y: point.y,
    scale: plaqueScale(dist),
    opacity: facingOpacity(dir.dot(view)),
    radius: 0,
  }
}

function Studio() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const env = pmrem.fromScene(room, 0.04).texture
    scene.environment = env
    room.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      obj.geometry.dispose()
      const material = obj.material
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose())
      else material.dispose()
    })
    return () => {
      scene.environment = null
      env.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 8]} intensity={1.15} />
    </>
  )
}

function Armillary({
  rig,
  poses,
  featureCount,
  agentCount,
  ink,
  paper,
}: {
  rig: RefObject<CitadelRig>
  poses: RefObject<CitadelPoses>
  featureCount: number
  agentCount: number
  ink: string
  paper: string
}) {
  const outerRef = useRef<THREE.Group>(null)
  const innerRef = useRef<THREE.Group>(null)
  const sphereRef = useRef<THREE.Mesh>(null)
  const outerMat = useRef<THREE.MeshStandardMaterial>(null)
  const innerMat = useRef<THREE.MeshStandardMaterial>(null)
  const sphereMat = useRef<THREE.MeshStandardMaterial>(null)
  const spin = useRef({ outer: 0, inner: 0 })
  const scratch = useRef<Scratch>({
    local: new THREE.Vector3(),
    world: new THREE.Vector3(),
    ndc: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    view: new THREE.Vector3(),
    cam: new THREE.Vector3(),
  })
  const outerColor = useMemo(() => mixColors(ink, paper, 0), [ink, paper])
  const innerColor = useMemo(() => mixColors(ink, paper, 0.28), [ink, paper])
  const shellColor = useMemo(() => mixColors(ink, paper, 0.45), [ink, paper])

  useFrame((state, delta) => {
    const rigNow = rig.current
    const poseNow = poses.current
    if (!rigNow || !poseNow) return
    const dt = Math.min(delta, 1 / 20)
    //scroll only damps spin. the angle itself is not scrubbed, so a trackpad reversal cannot rewind it
    spin.current.outer += dt * 0.35 * rigNow.spin
    spin.current.inner += dt * -0.22 * rigNow.spin
    const flatten = rigNow.flatten
    const outer = outerRef.current
    const inner = innerRef.current
    if (outer) {
      outer.rotation.x = THREE.MathUtils.lerp(1.15, 0, flatten)
      outer.rotation.z = 0
      outer.rotation.y = spin.current.outer
      outer.scale.set(1, 1, THREE.MathUtils.lerp(1, 0.06, flatten))
      outer.updateWorldMatrix(true, false)
    }
    if (inner) {
      inner.rotation.x = THREE.MathUtils.lerp(0.42, 0, flatten)
      inner.rotation.z = THREE.MathUtils.lerp(0.95, 0, flatten)
      inner.rotation.y = spin.current.inner
      inner.scale.set(1, 1, THREE.MathUtils.lerp(1, 0.06, flatten))
      inner.updateWorldMatrix(true, false)
    }
    const sphere = sphereRef.current
    if (sphere) {
      sphere.scale.set(1, 1, THREE.MathUtils.lerp(1, 0.04, rigNow.sphereFlat))
      sphere.updateWorldMatrix(true, false)
    }
    if (outerMat.current) outerMat.current.opacity = rigNow.ringOpacity
    if (innerMat.current) innerMat.current.opacity = rigNow.ringOpacity
    if (sphereMat.current) sphereMat.current.opacity = 1 - rigNow.sphereFlat

    const camera = state.camera
    camera.updateMatrixWorld()
    const rect = state.gl.domElement.getBoundingClientRect()
    const bag = scratch.current
    const features: FlightPose[] = []
    const agents: FlightPose[] = []
    if (outer) {
      for (let i = 0; i < featureCount; i += 1) {
        const theta = thetaAt(i, featureCount)
        features.push(projectOn(bag, outer, Math.cos(theta) * R0, Math.sin(theta) * R0, 0, camera, rect))
      }
    }
    if (inner) {
      for (let i = 0; i < agentCount; i += 1) {
        const theta = thetaAt(i, agentCount)
        agents.push(projectOn(bag, inner, Math.cos(theta) * R1, Math.sin(theta) * R1, 0, camera, rect))
      }
    }
    let calendar: FlightPose = poseNow.calendar
    if (sphere) {
      const center = projectOn(bag, sphere, 0, 0, 0, camera, rect)
      const rim = projectOn(bag, sphere, RS, 0, 0, camera, rect)
      calendar = {
        ...center,
        opacity: 1,
        radius: Math.hypot(rim.x - center.x, rim.y - center.y),
      }
    }
    poseNow.ready = features.length === featureCount && agents.length === agentCount
    poseNow.features = features
    poseNow.agents = agents
    poseNow.calendar = calendar
  })

  return (
    //drop the instrument below the headline so the title stays readable
    <group position={[0, -1.15, 0]}>
      <mesh ref={sphereRef} renderOrder={-1}>
        <sphereGeometry args={[RS, 24, 16]} />
        <meshStandardMaterial
          ref={sphereMat}
          color={shellColor}
          metalness={0.9}
          roughness={0.32}
          precision="highp"
          transparent
          opacity={1}
        />
      </mesh>
      <group ref={outerRef}>
        <mesh>
          <torusGeometry args={[R0, TUBE0, 8, 72]} />
          <meshStandardMaterial
            ref={outerMat}
            color={outerColor}
            metalness={0.9}
            roughness={0.32}
            precision="highp"
            transparent
            opacity={1}
          />
        </mesh>
      </group>
      <group ref={innerRef}>
        <mesh>
          <torusGeometry args={[R1, TUBE1, 8, 72]} />
          <meshStandardMaterial
            ref={innerMat}
            color={innerColor}
            metalness={0.9}
            roughness={0.32}
            precision="highp"
            transparent
            opacity={1}
          />
        </mesh>
      </group>
    </group>
  )
}

function dprFor(width: number): number | [number, number] {
  if (width < 760) return 1
  return [1, 1.25]
}

export function CitadelScene({ rig, poses, featureCount, agentCount, frameloop, hidden }: Props) {
  const colors = useMetalColors()
  const [dpr, setDpr] = useState<number | [number, number]>(() => dprFor(window.innerWidth))
  useEffect(() => {
    const apply = () => setDpr(dprFor(window.innerWidth))
    apply()
    window.addEventListener("resize", apply)
    return () => window.removeEventListener("resize", apply)
  }, [])

  return (
    <Canvas
      dpr={dpr}
      frameloop={frameloop}
      gl={rendererOptions}
      camera={{ fov: 32, position: [0, 0, cameraZ()], near: 0.05, far: 50 }}
      style={{ width: "100%", height: "100%", pointerEvents: "none", visibility: hidden ? "hidden" : "visible" }}
      aria-hidden
      onCreated={({ gl, scene }) => {
        gl.setClearColor(0x000000, 0)
        scene.background = null
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <Studio />
      <Armillary rig={rig} poses={poses} featureCount={featureCount} agentCount={agentCount} ink={colors.ink} paper={colors.paper} />
    </Canvas>
  )
}
