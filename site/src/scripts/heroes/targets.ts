// What the plug goes into: a planet with its port at (SX, 0, 0), facing -x,
// two slots the prongs slide into, and city lights that spread while a plug
// is in. "colour" uses the terminal palette; "minimal" is the footer's look:
// grey dots, a dithered crescent, one accent.
import { THREE, dots, type Dots } from './dots'

export const SX = 14

export type Style = 'colour' | 'minimal'

export interface Target {
  group: THREE.Group
  parts: Dots[]
  /** The highest y and the frontmost z, where the status screen goes. */
  top: number
  front: number
  connect(t: number): void
  release(t: number): void
  step(t: number, dt: number): void
}

const INK = new THREE.Color('#8a8780')
const TEAL = new THREE.Color('#87afaf')
const AMBER = new THREE.Color('#ffaf00')
const CLAY = new THREE.Color('#d97757')
const PINK = new THREE.Color('#d787af')
const GREY = new THREE.Color('#6b6a64')

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

/** A ring of dots around the port, lit while a plug is in. */
function rim(radius: number, x = SX - 0.1): Dot[] {
  const out: Dot[] = []
  for (let a = 0; a < Math.PI * 2; a += 0.14)
    out.push({ p: new THREE.Vector3(x, Math.sin(a) * radius, Math.cos(a) * radius), c: CLAY, tone: 0.22 })
  return out
}

function setRim(d: Dots, on: boolean) {
  for (let i = 0; i < d.tone.count; i++) d.tone.setX(i, on ? 1 : 0.22)
  d.tone.needsUpdate = true
}

function mix(a: THREE.Color, b: THREE.Color, k: number) {
  return a.clone().lerp(b, k)
}

// ─── Planet ──────────────────────────────────────────────────────────────────
// A dotted world, lit from the upper left, with a tilted ring and moons.
// Plugged in, city lights spread over it from the port.

export function planet(style: Style = 'colour'): Target {
  const minimal = style === 'minimal'
  const group = new THREE.Group()
  const C = new THREE.Vector3(SX + 8, 0, 0)
  const R = 8
  const light = new THREE.Vector3(-0.6, 0.55, 0.6).normalize()
  const port = new THREE.Vector3(-1, 0, 0)

  const surface: Dot[] = []
  const angle: number[] = []
  for (const n of fibonacci(minimal ? 2600 : 2200)) {
    const p = C.clone().addScaledVector(n, R)
    if (inSlot(p)) continue
    const lit = Math.max(0, n.dot(light))
    // Minimal keeps only the lit side, thinning towards the terminator: a dithered crescent.
    if (minimal && n.dot(port) < 0.9 && Math.random() > lit * 1.5) continue
    surface.push(
      minimal
        ? { p, c: GREY.clone().lerp(INK, lit), tone: 0.35 + lit * 0.6 }
        : { p, c: mix(INK, TEAL, 0.25 + lit * 0.45), tone: 0.14 + lit * 0.62 },
    )
    angle.push(n.angleTo(port))
  }
  const world = build(surface)
  const city = surface.map(() => (minimal ? CLAY : [AMBER, CLAY, PINK, AMBER][Math.floor(Math.random() * 4)]))
  const portRim = build(rim(2.9, SX + 0.55))

  // The ring, dashed so its spin shows; it tilts as a whole.
  const ring: Dot[] = []
  ;(minimal
    ? [[12.4, GREY]]
    : [
        [11.2, AMBER],
        [12.4, TEAL],
        [13.6, CLAY],
      ]
  ).forEach(([r, c]) => {
    for (let a = 0; a < Math.PI * 2; a += 0.045) {
      if (Math.sin(a * 13 + (r as number)) < -0.35) continue
      ring.push({
        p: new THREE.Vector3(Math.cos(a) * (r as number), 0, Math.sin(a) * (r as number)),
        c: c as THREE.Color,
        tone: 0.38,
      })
    }
  })
  const ringDots = build(ring)
  const ringTilt = new THREE.Group()
  ringTilt.position.copy(C)
  ringTilt.rotation.set(0.42, 0, 0.32)
  const ringSpin = new THREE.Group()
  ringSpin.add(ringDots.points)
  ringTilt.add(ringSpin)

  const moons = [
    { r: 17, speed: 0.35, tilt: new THREE.Euler(0.3, 0, -0.2), size: 1.1, phase: 1 },
    { r: 20.5, speed: 0.22, tilt: new THREE.Euler(-0.25, 0, 0.35), size: 0.8, phase: 4 },
  ]
    .slice(0, minimal ? 1 : 2)
    .map((m) => {
      const d = build(
        fibonacci(90).map((n) => ({ p: n.multiplyScalar(m.size), c: minimal ? GREY : mix(INK, TEAL, 0.4), tone: 0.7 })),
      )
      const holder = new THREE.Group()
      holder.add(d.points)
      group.add(holder)
      return { ...m, d, holder }
    })

  group.add(world.points, portRim.points, ringTilt)
  let on = false
  let spread = 0
  return {
    group,
    parts: [world, portRim, ringDots, ...moons.map((m) => m.d)],
    top: R + 1,
    front: R,
    connect() {
      on = true
      setRim(portRim, true)
    },
    release() {
      on = false
      setRim(portRim, false)
    },
    step(t, dt) {
      ringSpin.rotation.y += dt * (on ? 0.5 : 0.1)
      for (const m of moons) {
        const a = m.phase + t * m.speed
        m.holder.position
          .set(Math.cos(a) * m.r, 0, Math.sin(a) * m.r)
          .applyEuler(m.tilt)
          .add(C)
      }
      const goal = on ? Math.PI : 0
      if (Math.abs(goal - spread) < 0.001 && !on) return
      spread += (goal - spread) * Math.min(1, dt * (on ? 0.7 : 2.5))
      surface.forEach((s, i) => {
        const lit = angle[i] < spread
        const c = lit ? city[i] : s.c
        world.color.setXYZ(i, c.r, c.g, c.b)
        world.tone.setX(i, lit ? (minimal ? 0.85 : 0.55 + 0.45 * Math.abs(Math.sin(t * 3 + i))) : s.tone)
      })
      world.color.needsUpdate = world.tone.needsUpdate = true
    },
  }
}
