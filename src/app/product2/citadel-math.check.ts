import assert from "node:assert/strict"
import {
  R0,
  R1,
  RS,
  TUBE1,
  cameraZ,
  facingOpacity,
  flightFrame,
  openClip,
  plaqueScale,
  projectToViewport,
  sphereClearsInnerRing,
  thetaAt,
  thetasCoverOneTurn,
  type FlightPose,
} from "./citadel-math"

assert.ok(sphereClearsInnerRing(), "the sphere clears the inner ring")
assert.ok(RS + 0.12 < R1 - TUBE1)
assert.ok(cameraZ() > R0, "the camera sits outside the outer band")

assert.ok(thetasCoverOneTurn(5), "feature plaques cover one turn")
assert.ok(thetasCoverOneTurn(7), "agent plaques cover one turn")
assert.ok(thetasCoverOneTurn(1))
assert.equal(thetaAt(0, 4), -Math.PI / 2)

const center = projectToViewport(0, 0, { left: 10, top: 20, width: 200, height: 100 })
assert.equal(center.x, 110)
assert.equal(center.y, 70)

assert.equal(plaqueScale(1), 1.15)
assert.equal(plaqueScale(100), 0.45)
assert.equal(facingOpacity(0.15), 0)
assert.equal(facingOpacity(0), 0)
assert.equal(facingOpacity(0.5), 1)
assert.ok(facingOpacity(0.3) > 0 && facingOpacity(0.3) < 1)

const pose: FlightPose = { x: 100, y: 80, scale: 0.5, opacity: 0.25, radius: 40 }
const slot = { left: 40, top: 200, width: 400, height: 300 }
const landed = flightFrame(pose, slot, 1)
assert.equal(landed.x, slot.left)
assert.equal(landed.y, slot.top)
assert.equal(landed.scale, 1)
assert.equal(landed.opacity, 1)
assert.equal(landed.transform, "translate3d(40px, 200px, 0) scale(1)")

const parked = flightFrame(pose, slot, 0)
assert.equal(parked.x + slot.width / 2, pose.x)
assert.equal(parked.y + slot.height / 2, pose.y)
assert.equal(parked.scale, 0.5)

assert.equal(openClip(1, 40, 0.5, 400, 300), "")
assert.equal(openClip(0, 40, 0.5, 400, 300), "circle(80px at 50% 50%)")
