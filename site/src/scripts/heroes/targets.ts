// What the plug goes into: a dithered planet in the footer's greys, its port
// at (SX, 0, 0) facing -x with two slots the prongs slide into, a tilted
// ring and a moon. While a plug is in, city lights spread from the port.
import { THREE, dots, type Dots } from './dots'

export const SX = 14

export interface Target {
  group: THREE.Group
  parts: Dots[]
  connect(): void
  release(): void
  step(t: number, dt: number): void
}

const INK = new THREE.Color('#8a8780')
const GREY = new THREE.Color('#6b6a64')
const CLAY = new THREE.Color('#d97757')

function fibonacci(n: number) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / (n - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    return new THREE.Vector3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r)
  })
}

/** True where the port's two slots are cut out. */
function inSlot(p: THREE.Vector3) {
  return Math.abs(p.x - SX) < 1.4 && Math.abs(Math.abs(p.y) - 1.2) < 0.55 && Math.abs(p.z) < 0.5
}

interface Dot {
  p: THREE.Vector3
  c: THREE.Color
  tone: number
}

function build(list: Dot[]) {
  const d = dots(list.length)
  list.forEach(({ p, c, tone }, i) => {
    d.position.setXYZ(i, p.x, p.y, p.z)
    d.color.setXYZ(i, c.r, c.g, c.b)
    d.tone.setX(i, tone)
  })
  d.flush()
  return d
}

export function planet(): Target {
  const group = new THREE.Group()
  const C = new THREE.Vector3(SX + 8, 0, 0)
  const R = 8
  const light = new THREE.Vector3(-0.6, 0.55, 0.6).normalize()
  const port = new THREE.Vector3(-1, 0, 0)

  // Only the lit side, thinning towards the terminator: a dithered crescent.
  const surface: Dot[] = []
  const angle: number[] = []
  for (const n of fibonacci(2600)) {
    const p = C.clone().addScaledVector(n, R)
    if (inSlot(p)) continue
    const lit = Math.max(0, n.dot(light))
    if (n.dot(port) < 0.9 && Math.random() > lit * 1.5) continue
    surface.push({ p, c: GREY.clone().lerp(INK, lit), tone: 0.35 + lit * 0.6 })
    angle.push(n.angleTo(port))
  }
  const world = build(surface)

  // A ring of dots around the port, lit while a plug is in.
  const rim: Dot[] = []
  for (let a = 0; a < Math.PI * 2; a += 0.14)
    rim.push({ p: new THREE.Vector3(SX + 0.55, Math.sin(a) * 2.9, Math.cos(a) * 2.9), c: CLAY, tone: 0.22 })
  const portRim = build(rim)
  const lightRim = (on: boolean) => {
    for (let i = 0; i < portRim.tone.count; i++) portRim.tone.setX(i, on ? 1 : 0.22)
    portRim.tone.needsUpdate = true
  }

  // The ring, dashed so its spin shows; it tilts as a whole.
  const ring: Dot[] = []
  for (let a = 0; a < Math.PI * 2; a += 0.045) {
    if (Math.sin(a * 13 + 12.4) < -0.35) continue
    ring.push({ p: new THREE.Vector3(Math.cos(a) * 12.4, 0, Math.sin(a) * 12.4), c: GREY, tone: 0.38 })
  }
  const ringDots = build(ring)
  const ringTilt = new THREE.Group()
  ringTilt.position.copy(C)
  ringTilt.rotation.set(0.42, 0, 0.32)
  const ringSpin = new THREE.Group()
  ringSpin.add(ringDots.points)
  ringTilt.add(ringSpin)

  const moon = build(fibonacci(90).map((n) => ({ p: n.multiplyScalar(1.1), c: GREY, tone: 0.7 })))
  const moonTilt = new THREE.Euler(0.3, 0, -0.2)

  group.add(world.points, portRim.points, ringTilt, moon.points)
  let on = false
  let spread = 0
  return {
    group,
    parts: [world, portRim, ringDots, moon],
    connect() {
      on = true
      lightRim(true)
    },
    release() {
      on = false
      lightRim(false)
    },
    step(t, dt) {
      ringSpin.rotation.y += dt * (on ? 0.5 : 0.1)
      const a = 1 + t * 0.35
      moon.points.position.set(Math.cos(a) * 17, 0, Math.sin(a) * 17).applyEuler(moonTilt).add(C)

      // City lights spread from the port while plugged in, and go out after.
      const goal = on ? Math.PI : 0
      if (Math.abs(goal - spread) < 0.001) return
      spread += (goal - spread) * Math.min(1, dt * (on ? 0.7 : 2.5))
      surface.forEach((s, i) => {
        const lit = angle[i] < spread
        const c = lit ? CLAY : s.c
        world.color.setXYZ(i, c.r, c.g, c.b)
        world.tone.setX(i, lit ? 0.85 : s.tone)
      })
      world.color.needsUpdate = world.tone.needsUpdate = true
    },
  }
}
