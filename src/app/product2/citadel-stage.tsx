"use client"

import dynamic from "next/dynamic"
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { useGSAP } from "@gsap/react"
import Lenis from "lenis"
import { smoothScrollToElement } from "@/shared/motion"
import { AgentSlide } from "./agent-reel"
import { flightFrame, openClip, type CitadelPoses, type CitadelRig, type FlightPose } from "./citadel-math"
import { bindCitadelLenis, scrollCitadelTo } from "./citadel-scroll"
import { ExploreDialog } from "./explore-dialog"
import { FEATURES, FeatureBody, type FeatureId } from "./feature-reel"
import { ProductStage, CalendarPreview } from "./preview"
import { AGENT_SCENARIOS, type AgentScenarioId } from "./product-demo-conversations"
import { ProductScrollLink } from "./product-scroll-link"
import citadel from "./citadel.module.css"
import styles from "./product.module.css"

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, ScrollTrigger)

const CitadelCanvas = dynamic(() => import("./citadel-scene").then((mod) => mod.CitadelScene), { ssr: false })

type MotionMode = "pending" | "on" | "off"
type JobKind = "calendar" | "feature" | "agent"

type Job = {
  key: string
  kind: JobKind
  index: number
}

const JOBS: Job[] = [
  { key: "calendar", kind: "calendar", index: 0 },
  ...FEATURES.map((feature, index) => ({ key: `feature:${feature.id}`, kind: "feature" as const, index })),
  ...AGENT_SCENARIOS.map((scenario, index) => ({ key: `agent:${scenario.id}`, kind: "agent" as const, index })),
]

function stableBind(cache: RefObject<Record<string, (el: HTMLElement | null) => void>>, map: RefObject<Map<string, HTMLElement>>, key: string) {
  const bag = cache.current
  if (!bag) return () => {}
  const existing = bag[key]
  if (existing) return existing
  const next = (el: HTMLElement | null) => {
    const boxes = map.current
    if (!boxes) return
    if (el) boxes.set(key, el)
    else boxes.delete(key)
  }
  bag[key] = next
  return next
}

function poseFor(job: Job, poses: CitadelPoses): FlightPose | null {
  if (job.kind === "calendar") return poses.calendar
  if (job.kind === "feature") return poses.features[job.index] ?? null
  return poses.agents[job.index] ?? null
}

function clearNode(slot: HTMLElement, node: HTMLElement) {
  node.removeAttribute("data-flight")
  node.removeAttribute("data-home")
  node.style.position = ""
  node.style.left = ""
  node.style.top = ""
  node.style.width = ""
  node.style.height = ""
  node.style.transform = ""
  node.style.opacity = ""
  node.style.zIndex = ""
  node.style.clipPath = ""
  node.style.willChange = ""
  node.style.visibility = ""
  slot.style.height = ""
  delete slot.dataset.locked
  delete slot.dataset.home
}

function Hero({ className }: { className?: string }) {
  return (
    <section className={className ? `${styles.hero} ${className}` : styles.hero}>
      <div className={styles.eyebrow}><span /> A LITTLE STRUCTURE. A LOT MORE POSSIBILITY.</div>
      <h1>Your days,<br /><em>thoughtfully</em> planned.</h1>
      <p>Bring your calendars together. Talk through your plans.<br className={styles.desktopBreak} /> Find a little more space for what matters.</p>
      <div className={styles.actions}>
        <Link className={styles.primary} href="/">Start your day with WatAgent <span aria-hidden="true">↗</span></Link>
        <ProductScrollLink className={styles.secondary} href="#preview">Explore the calendar <span aria-hidden="true">↓</span></ProductScrollLink>
      </div>
      <div className={styles.heroNote}>YOUR WEEK, WITH A LITTLE BREATHING ROOM.</div>
    </section>
  )
}

function StaticIntro() {
  return (
    <>
      <Hero />
      <section id="preview" className={styles.previewSection} aria-label="Interactive product preview">
        <div className={styles.previewCaption}><span>YOUR CALENDAR, WITH AN ASSISTANT</span><span>↓ Explore WatAgent</span></div>
        <ProductStage />
      </section>
    </>
  )
}

function MotionIntro({ active }: { active: boolean }) {
  const stageRef = useRef<HTMLElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const headlineRef = useRef<HTMLDivElement>(null)
  const slots = useRef(new Map<string, HTMLElement>())
  const nodes = useRef(new Map<string, HTMLElement>())
  const slotBinds = useRef<Record<string, (el: HTMLElement | null) => void>>({})
  const nodeBinds = useRef<Record<string, (el: HTMLElement | null) => void>>({})
  const rig = useRef<CitadelRig>({ spin: 1, flatten: 0, sphereFlat: 0, ringOpacity: 1 })
  const poses = useRef<CitadelPoses>({
    ready: false,
    calendar: { x: 0, y: 0, scale: 1, opacity: 1, radius: 120 },
    features: [],
    agents: [],
  })
  const settledRef = useRef(false)
  const [settled, setSettled] = useState(false)
  const [glOn, setGlOn] = useState(true)
  const [pageVisible, setPageVisible] = useState(true)
  const [featureFocus, setFeatureFocus] = useState<FeatureId>("tags")
  const [activeTurn, setActiveTurn] = useState<AgentScenarioId>("weekend-plan")
  const [ask, setAsk] = useState(false)
  const [docked, setDocked] = useState(false)

  useLayoutEffect(() => setDocked(true), [])

  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible")
    document.addEventListener("visibilitychange", onVis)
    return () => document.removeEventListener("visibilitychange", onVis)
  }, [])

  useGSAP(() => {
    if (!active || !stageRef.current) return
    const mm = gsap.matchMedia()
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      columnRef.current?.setAttribute("data-arm", "true")
      const lenis = new Lenis({ lerp: 0.085, smoothWheel: true })
      bindCitadelLenis(lenis)
      lenis.on("scroll", ScrollTrigger.update)
      const tick = (time: number) => lenis.raf(time * 1000)
      gsap.ticker.add(tick)
      gsap.ticker.lagSmoothing(0)

      const applyFlight = () => {
        const stage = stageRef.current
        const hud = headlineRef.current
        if (stage && hud) {
          const top = stage.getBoundingClientRect().top
          hud.style.setProperty("--citadel-hud", `${Math.max(0, top)}px`)
        }
        const poseNow = poses.current
        if (!poseNow?.ready) return
        const slideU = rig.current.flatten
        const sphereU = rig.current.sphereFlat
        const release = slideU >= 0.999
        const reads: Array<{ job: Job; slot: HTMLElement; node: HTMLElement; rect: DOMRect; pose: FlightPose }> = []
        for (const job of JOBS) {
          const slot = slots.current.get(job.key)
          const node = nodes.current.get(job.key)
          const pose = poseFor(job, poseNow)
          if (!slot || !node || !pose) continue
          reads.push({ job, slot, node, rect: slot.getBoundingClientRect(), pose })
        }
        for (const item of reads) {
          if (release) {
            if (item.slot.dataset.home === "true") continue
            clearNode(item.slot, item.node)
            item.node.setAttribute("data-home", "true")
            item.slot.dataset.home = "true"
            continue
          }
          delete item.slot.dataset.home
          item.node.removeAttribute("data-home")
          if (item.rect.width < 2 || item.rect.height < 2) continue
          if (item.slot.dataset.locked !== "true") {
            item.slot.style.height = `${item.rect.height}px`
            item.slot.dataset.locked = "true"
          }
          const u = item.job.kind === "calendar" ? sphereU : slideU
          const box = { left: item.rect.left, top: item.rect.top, width: item.rect.width, height: item.rect.height }
          const frame = flightFrame(item.pose, box, u)
          const node = item.node
          node.setAttribute("data-flight", "true")
          node.style.position = "fixed"
          node.style.left = "0px"
          node.style.top = "0px"
          node.style.width = `${box.width}px`
          node.style.height = `${box.height}px`
          node.style.transform = frame.transform
          node.style.opacity = String(frame.opacity)
          node.style.willChange = "transform"
          node.style.zIndex = String(item.job.kind === "calendar" ? 6 : Math.round(3 + item.pose.opacity * 8 + item.pose.scale * 4))
          if (item.job.kind === "calendar") {
            node.style.clipPath = openClip(sphereU, item.pose.radius, frame.scale, box.width, box.height)
            node.style.visibility = "visible"
          } else {
            node.style.clipPath = ""
            node.style.visibility = frame.opacity < 0.04 ? "hidden" : "visible"
          }
        }
      }

      const remeasure = () => {
        for (const job of JOBS) {
          const slot = slots.current.get(job.key)
          const node = nodes.current.get(job.key)
          if (!slot || !node) continue
          clearNode(slot, node)
        }
        applyFlight()
      }

      let measuring = false
      const onRefresh = () => {
        if (measuring) return
        measuring = true
        remeasure()
        measuring = false
      }
      ScrollTrigger.addEventListener("refreshInit", onRefresh)

      const tl = gsap.timeline({
        scrollTrigger: {
          id: "citadel",
          trigger: stageRef.current,
          start: "top top",
          end: "+=220%",
          pin: true,
          scrub: 0.8,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          pinType: "fixed",
          onLeave: () => setGlOn(false),
          onEnterBack: () => setGlOn(true),
          onUpdate: () => {
            const mark = tl.labels.settled ?? 0.86
            const next = tl.time() >= mark - 0.0001
            if (next === settledRef.current) return
            settledRef.current = next
            setSettled(next)
          },
        },
      })
      tl.addLabel("orbit", 0)
      tl.to(rig.current, { spin: 0, ease: "power2.in", duration: 0.45 }, 0.12)
      tl.to(rig.current, { flatten: 1, ease: "power2.inOut", duration: 0.7 }, 0.2)
      tl.to(rig.current, { sphereFlat: 1, ease: "power3.inOut", duration: 0.55 }, 0.3)
      tl.to(rig.current, { ringOpacity: 0, ease: "power1.out", duration: 0.18 }, 0.74)
      tl.addLabel("settled", 0.86)
      if (headlineRef.current) {
        tl.to(headlineRef.current, { autoAlpha: 0, duration: 0.4, ease: "power2.inOut" }, 0.16)
      }

      gsap.ticker.add(applyFlight)
      void document.fonts?.ready.then(() => ScrollTrigger.refresh())

      let stopped = false
      return () => {
        if (stopped) return
        stopped = true
        gsap.ticker.remove(tick)
        gsap.ticker.remove(applyFlight)
        gsap.ticker.lagSmoothing(500, 33)
        ScrollTrigger.removeEventListener("refreshInit", onRefresh)
        bindCitadelLenis(null)
        lenis.destroy()
        columnRef.current?.removeAttribute("data-arm")
        for (const job of JOBS) {
          const slot = slots.current.get(job.key)
          const node = nodes.current.get(job.key)
          if (!slot || !node) continue
          clearNode(slot, node)
        }
      }
    })
    return () => mm.revert()
  }, { scope: stageRef, dependencies: [active], revertOnUpdate: true })

  function showFeature(id: FeatureId) {
    setFeatureFocus(id)
    const target = document.getElementById(`citadel-feature-${id}`)
    if (!target) return
    if (!scrollCitadelTo(target)) smoothScrollToElement(target, "start")
  }

  const renderGl = active && pageVisible && glOn && !settled
  const lock = active && !settled

  return (
    <>
      <section ref={stageRef} className={citadel.stage} data-live={renderGl ? "true" : undefined}>
        {active ? (
          <div className={citadel.canvas} data-hidden={renderGl ? undefined : "true"}>
            <CitadelCanvas
              rig={rig}
              poses={poses}
              featureCount={FEATURES.length}
              agentCount={AGENT_SCENARIOS.length}
              frameloop={renderGl ? "always" : "never"}
              hidden={!renderGl}
            />
          </div>
        ) : null}
        {docked && typeof document !== "undefined"
          ? createPortal(
              <div ref={headlineRef} className={citadel.hud} data-dock="true" data-live={renderGl ? "true" : undefined}>
                <Hero className={citadel.hero} />
              </div>,
              document.body,
            )
          : (
              <div ref={headlineRef} className={citadel.hud}>
                <Hero className={citadel.hero} />
              </div>
            )}
      </section>
      <div
        ref={columnRef}
        id="preview"
        className={`${styles.previewSection} ${citadel.column}`}
        data-lock={lock ? "true" : undefined}
        inert={lock ? true : undefined}
        aria-label="Interactive product preview"
      >
        <div className={styles.previewCaption}><span>YOUR CALENDAR, WITH AN ASSISTANT</span><span>↓ Explore WatAgent</span></div>
        <div className={citadel.slot} ref={stableBind(slotBinds, slots, "calendar")}>
          <div className={citadel.flyer} ref={stableBind(nodeBinds, nodes, "calendar")}>
            <CalendarPreview onFeature={showFeature} onAskAgent={() => setAsk(true)} />
          </div>
        </div>
        <div className={styles.showcase} id="showcase">
          <div className={styles.sectionIntro}>
            <span className={styles.label}>A CLOSER LOOK</span>
            <h2>Turn it, and <em>read a side.</em></h2>
            <p>Tags, events, tasks, calendars, and rules.<br />Open a row. Make a tag on the calendar itself.</p>
          </div>
          <div>
            {FEATURES.map((feature) => (
              <div
                key={feature.id}
                id={`citadel-feature-${feature.id}`}
                className={`${citadel.slot} ${citadel.slideSlot}`}
                ref={stableBind(slotBinds, slots, `feature:${feature.id}`)}
                data-current={featureFocus === feature.id ? "true" : undefined}
              >
                <article className={`${citadel.card} ${citadel.flyer}`} ref={stableBind(nodeBinds, nodes, `feature:${feature.id}`)}>
                  <header className={citadel.cardHead}>
                    <span>{feature.kicker}</span>
                    <h3>{feature.title}</h3>
                  </header>
                  <div data-citadel-scroll="">
                    <FeatureBody id={feature.id} />
                  </div>
                </article>
              </div>
            ))}
          </div>
          <div className={styles.agentShowcase}>
            <div className={styles.sectionIntro}>
              <span className={styles.label}>THE ASSISTANT</span>
              <h2>Ask in plain language.<br />Watch it <em>work the calendar.</em></h2>
              <p>Real turns from student weeks: thinking, tool calls, and answers — queued for your approval in the app.</p>
            </div>
            <div>
              {AGENT_SCENARIOS.map((scenario) => {
                const id = scenario.id as AgentScenarioId
                const playing = settled && id === activeTurn
                return (
                  <div key={id} className={`${citadel.slot} ${citadel.slideSlot}`} ref={stableBind(slotBinds, slots, `agent:${id}`)}>
                    <article className={`${citadel.card} ${citadel.flyer}`} data-active={playing ? "true" : undefined} ref={stableBind(nodeBinds, nodes, `agent:${id}`)}>
                      <header className={citadel.cardHead}>
                        <span>{scenario.kicker}</span>
                        <h3>{scenario.title}</h3>
                        <button type="button" className={citadel.pick} aria-pressed={id === activeTurn} onClick={() => setActiveTurn(id)}>
                          {id === activeTurn ? "This turn" : "Play this turn"}
                        </button>
                      </header>
                      <div className={citadel.agentBody}>
                        <AgentSlide id={id} playing={playing} onAskAgent={() => setAsk(true)} />
                      </div>
                    </article>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {ask ? <ExploreDialog onClose={() => setAsk(false)} /> : null}
    </>
  )
}

export function CitadelStage() {
  const [motion, setMotion] = useState<MotionMode>("pending")

  useLayoutEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setMotion(query.matches ? "off" : "on")
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  if (motion === "off") return <StaticIntro />
  return <MotionIntro active={motion === "on"} />
}
