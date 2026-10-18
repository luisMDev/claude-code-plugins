// What the plug goes into: a planet, a brain or a hive mind. Each has its
// port at (SX, 0, 0), facing -x, with two slots the prongs slide into, and
// comes alive in its own way while a plug is in.
import { THREE, dots, type Dots } from './dots'

export const SX = 14

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
  for (let a = 0; a < Math.PI * 2; a += 0.14) out.push({ p: new THREE.Vector3(x, Math.sin(a) * radius, Math.cos(a) * radius), c: CLAY, tone: 0.22 })
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
// A dotted world, lit from the upper left, with a tilted ring and two moons.
// Plugged in, city lights spread over it from the port.

export function planet(): Target {
  const group = new THREE.Group()
  const C = new THREE.Vector3(SX + 8, 0, 0)
  const R = 8
  const light = new THREE.Vector3(-0.6, 0.55, 0.6).normalize()
  const port = new THREE.Vector3(-1, 0, 0)

  const surface: Dot[] = []
  const angle: number[] = []
  for (const n of fibonacci(2200)) {
    const p = C.clone().addScaledVector(n, R)
    if (inSlot(p)) continue
    const lit = Math.max(0, n.dot(light))
    surface.push({ p, c: mix(INK, TEAL, 0.25 + lit * 0.45), tone: 0.14 + lit * 0.62 })
    angle.push(n.angleTo(port))
  }
  const world = build(surface)
  const city = surface.map(() => [AMBER, CLAY, PINK, AMBER][Math.floor(Math.random() * 4)])
  const portRim = build(rim(2.9, SX + 0.55))

  // The ring, dashed so its spin shows; it tilts as a whole.
  const ring: Dot[] = []
  ;[
    [11.2, AMBER],
    [12.4, TEAL],
    [13.6, CLAY],
  ].forEach(([r, c]) => {
    for (let a = 0; a < Math.PI * 2; a += 0.045) {
      if (Math.sin(a * 13 + (r as number)) < -0.35) continue
      ring.push({ p: new THREE.Vector3(Math.cos(a) * (r as number), 0, Math.sin(a) * (r as number)), c: c as THREE.Color, tone: 0.38 })
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
  ].map((m) => {
    const d = build(fibonacci(90).map((n) => ({ p: n.multiplyScalar(m.size), c: mix(INK, TEAL, 0.4), tone: 0.7 })))
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
        m.holder.position.set(Math.cos(a) * m.r, 0, Math.sin(a) * m.r).applyEuler(m.tilt).add(C)
      }
      const goal = on ? Math.PI : 0
      if (Math.abs(goal - spread) < 0.001 && !on) return
      spread += (goal - spread) * Math.min(1, dt * (on ? 0.7 : 2.5))
      surface.forEach((s, i) => {
        const lit = angle[i] < spread
        const c = lit ? city[i] : s.c
        world.color.setXYZ(i, c.r, c.g, c.b)
        world.tone.setX(i, lit ? 0.55 + 0.45 * Math.abs(Math.sin(t * 3 + i)) : s.tone)
      })
      world.color.needsUpdate = world.tone.needsUpdate = true
    },
  }
}

// ─── Brain ───────────────────────────────────────────────────────────────────
// Two folded hemispheres, a cerebellum and a stem, with synapse arcs above.
// Idle, faint thoughts ripple across it; plugged in, it fires.

export function brain(): Target {
  const group = new THREE.Group()
  const C = new THREE.Vector3(SX + 6.9, 0, 0)
  const tissue = mix(INK, PINK, 0.35)

  const cortex: Dot[] = []
  for (const side of [-1, 1]) {
    for (const n of fibonacci(1700)) {
      if (n.z * side < -0.72) continue // the inner wall, left open as the fissure
      const fold = Math.sin(n.x * 9 + Math.sin(n.y * 6) * 1.6) * Math.sin(n.y * 8 - n.z * 5 + n.x * 2)
      if (fold < -0.55) continue // the deepest grooves read as gaps
      const r = 1 + 0.045 * fold
      const p = new THREE.Vector3(n.x * 7.5 * r, n.y * 5.2 * r, n.z * 4 * r + side * 1.6).add(C)
      if (inSlot(p)) continue
      cortex.push({ p, c: tissue, tone: 0.22 + 0.45 * (fold * 0.5 + 0.5) })
    }
  }
  const little = C.clone().add(new THREE.Vector3(4.8, -3.4, 0))
  for (const n of fibonacci(600)) {
    const p = new THREE.Vector3(n.x * 2.8, n.y * 2, n.z * 3.6).add(little)
    if (Math.sin(p.y * 11) < -0.4) continue
    cortex.push({ p, c: tissue, tone: 0.4 })
  }
  for (let i = 0; i < 220; i++) {
    const k = Math.random()
    const a = Math.random() * Math.PI * 2
    const axis = C.clone().add(new THREE.Vector3(2.8 + k * 0.8, -3.5 - k * 5.5, 0))
    cortex.push({ p: axis.add(new THREE.Vector3(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1)), c: tissue, tone: 0.35 })
  }
  const body = build(cortex)
  const portRim = build(rim(2.7))

  // Synapse arcs: curves between points on the surface, bowed outwards.
  const ARC = 16
  const arcs: Dot[] = []
  for (let k = 0; k < 26; k++) {
    const a = cortex[Math.floor(Math.random() * cortex.length)].p
    const b = cortex[Math.floor(Math.random() * cortex.length)].p
    const mid = a.clone().lerp(b, 0.5)
    const ctrl = mid.clone().add(mid.clone().sub(C).setLength(4))
    for (let j = 0; j < ARC; j++) {
      const f = j / (ARC - 1)
      const q = 1 - f
      arcs.push({ p: a.clone().multiplyScalar(q * q).addScaledVector(ctrl, 2 * q * f).addScaledVector(b, f * f), c: PINK, tone: 0.06 })
    }
  }
  const arcDots = build(arcs)
  group.add(body.points, portRim.points, arcDots.points)

  let on = false
  const waves: { o: THREE.Vector3; t0: number; power: number }[] = []
  let nextWave = 0
  return {
    group,
    parts: [body, portRim, arcDots],
    top: 6.5,
    front: 6,
    connect(t) {
      on = true
      setRim(portRim, true)
      waves.push({ o: new THREE.Vector3(SX, 0, 0), t0: t, power: 1 })
    },
    release() {
      on = false
      setRim(portRim, false)
    },
    step(t) {
      // New thoughts: often and strong while plugged in, rare and faint when idle.
      if (t > nextWave) {
        nextWave = t + (on ? 0.35 : 1.8) * (0.6 + Math.random() * 0.8)
        waves.push({ o: cortex[Math.floor(Math.random() * cortex.length)].p, t0: t, power: on ? 1 : 0.35 })
      }
      for (let w = waves.length - 1; w >= 0; w--) if (t - waves[w].t0 > 2.4) waves.splice(w, 1)
      const glowColor = on ? CLAY : PINK
      cortex.forEach((s, i) => {
        let glow = 0
        for (const w of waves) {
          const d = s.p.distanceTo(w.o) - (t - w.t0) * 9
          glow = Math.max(glow, Math.exp(-d * d * 0.22) * w.power * (1 - (t - w.t0) / 2.4))
        }
        const c = glow > 0.02 ? mix(s.c, glow > 0.6 ? AMBER : glowColor, Math.min(1, glow)) : s.c
        body.color.setXYZ(i, c.r, c.g, c.b)
        body.tone.setX(i, Math.min(1, s.tone + glow * 0.8))
      })
      body.color.needsUpdate = body.tone.needsUpdate = true
      for (let i = 0; i < arcs.length; i++) {
        const f = (i % ARC) / ARC
        const pulse = on ? Math.pow(Math.max(0, Math.sin((f * 2 - t * 1.4 + Math.floor(i / ARC) * 0.37) * Math.PI)), 14) : 0
        arcDots.tone.setX(i, 0.06 + pulse * 0.9)
        const c = pulse > 0.3 ? CLAY : PINK
        arcDots.color.setXYZ(i, c.r, c.g, c.b)
      }
      arcDots.tone.needsUpdate = arcDots.color.needsUpdate = true
    },
  }
}

// ─── Hive ────────────────────────────────────────────────────────────────────
// A hive mind: hexagonal cells joined to their nearest neighbours. Idle, a
// cell blinks here and there; plugged in, activation spreads out from the
// port cell by cell, and pulses run along every link between awake cells.

export function hive(): Target {
  const group = new THREE.Group()
  const C = new THREE.Vector3(SX + 8.5, 0, 0)
  const nodes: THREE.Vector3[] = [new THREE.Vector3(SX + 0.2, 0, 0)] // node 0 is the port
  for (const n of fibonacci(64)) {
    const p = C.clone().addScaledVector(n, 7.5 + (Math.random() - 0.5) * 1.6)
    if (p.x < SX + 2.5) continue // keep the port's side clear
    nodes.push(p)
  }
  for (let i = 0; i < 12; i++) nodes.push(C.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 4)))

  // Links: each cell to its three nearest, the port to its five nearest.
  const links = new Map<string, [number, number]>()
  nodes.forEach((p, i) => {
    nodes
      .map((q, j) => ({ j, d: p.distanceTo(q) }))
      .filter(({ j }) => j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, i === 0 ? 5 : 3)
      .forEach(({ j }) => links.set(i < j ? `${i}-${j}` : `${j}-${i}`, i < j ? [i, j] : [j, i]))
  })
  const edges = [...links.values()]

  // How many links each cell is from the port.
  const hops = nodes.map(() => Infinity)
  hops[0] = 0
  const queue = [0]
  while (queue.length) {
    const i = queue.shift()!
    for (const [a, b] of edges) {
      const j = a === i ? b : b === i ? a : -1
      if (j >= 0 && hops[j] === Infinity) {
        hops[j] = hops[i] + 1
        queue.push(j)
      }
    }
  }

  const cells: Dot[] = []
  const owner: number[] = []
  nodes.forEach((p, i) => {
    if (i === 0) return
    const r = 0.7
    for (let s = 0; s < 6; s++) {
      const a0 = (s / 6) * Math.PI * 2
      const a1 = ((s + 1) / 6) * Math.PI * 2
      for (let k = 0; k < 3; k++) {
        const a = a0 + ((a1 - a0) * k) / 3
        cells.push({ p: p.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)), c: TEAL, tone: 0.5 })
        owner.push(i)
      }
    }
    cells.push({ p: p.clone(), c: TEAL, tone: 0.8 })
    owner.push(i)
  })
  const cellDots = build(cells)

  const wires: Dot[] = []
  const wireOf: { edge: number; f: number }[] = []
  edges.forEach(([a, b], e) => {
    const n = Math.max(2, Math.round(nodes[a].distanceTo(nodes[b]) / 0.5))
    for (let k = 1; k < n; k++) {
      wires.push({ p: nodes[a].clone().lerp(nodes[b], k / n), c: INK, tone: 0.22 })
      wireOf.push({ edge: e, f: k / n })
    }
  })
  const wireDots = build(wires)
  const portRim = build(rim(2.6))
  group.add(cellDots.points, wireDots.points, portRim.points)

  const awakeAt = nodes.map(() => Infinity)
  const blink = nodes.map(() => -10)
  let nextBlink = 0
  return {
    group,
    parts: [cellDots, wireDots, portRim],
    top: 8.5,
    front: 8,
    connect(t) {
      setRim(portRim, true)
      nodes.forEach((_, i) => (awakeAt[i] = t + hops[i] * 0.16))
    },
    release() {
      setRim(portRim, false)
      awakeAt.fill(Infinity)
    },
    step(t) {
      if (t > nextBlink) {
        nextBlink = t + 0.25 + Math.random() * 0.4
        blink[1 + Math.floor(Math.random() * (nodes.length - 1))] = t
      }
      const awake = (i: number) => t >= awakeAt[i]
      cells.forEach((s, k) => {
        const i = owner[k]
        const since = t - awakeAt[i]
        const flash = since >= 0 && since < 0.3 ? 1 - since / 0.3 : 0
        const idle = Math.max(0, 1 - (t - blink[i]) / 0.6)
        const c = awake(i) ? (flash > 0 ? AMBER : CLAY) : idle > 0 ? mix(TEAL, AMBER, idle * 0.5) : TEAL
        cellDots.color.setXYZ(k, c.r, c.g, c.b)
        cellDots.tone.setX(k, awake(i) ? Math.min(1, 0.8 + flash * 0.2) : Math.min(1, s.tone + idle * 0.5))
      })
      cellDots.color.needsUpdate = cellDots.tone.needsUpdate = true
      wireOf.forEach(({ edge, f }, k) => {
        const [a, b] = edges[edge]
        const live = awake(a) && awake(b)
        const pulse = live ? Math.pow(Math.max(0, Math.sin((f * 2 - t * 1.8 + edge * 0.29) * Math.PI)), 10) : 0
        const c = live ? (pulse > 0.3 ? AMBER : CLAY) : INK
        wireDots.color.setXYZ(k, c.r, c.g, c.b)
        wireDots.tone.setX(k, live ? 0.25 + pulse * 0.75 : 0.22)
      })
      wireDots.color.needsUpdate = wireDots.tone.needsUpdate = true
    },
  }
}

export const TARGETS = { planet, brain, hive }
export type TargetKind = keyof typeof TARGETS
