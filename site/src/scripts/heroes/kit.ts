// The parts every plug header is built from: voxel boxes of dots, the plug,
// the socket, a verlet cable, sparks and the caption that types itself.
import { THREE, dots, ink, reduced, type Dots, type Stage } from './dots'

export const PRONG = 2.6 // how far the prongs reach past the plug's face
export const TAIL = 7.5 // from the plug's face back to where the cable enters

/** x, y, z, tone, and 1 when the dot takes the accent. */
export type Point = [x: number, y: number, z: number, tone: number, accent: number]

/** Dots on the faces of a box, `gap` apart. */
export function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, gap: number, tone: number) {
  const out: Point[] = []
  const span = (a: number, b: number) => {
    const n = Math.max(1, Math.round((b - a) / gap))
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n)
  }
  const xs = span(x0, x1)
  const ys = span(y0, y1)
  const zs = span(z0, z1)
  for (const x of xs) for (const y of ys) out.push([x, y, z0, tone, 0], [x, y, z1, tone, 0])
  for (const x of xs) for (const z of zs.slice(1, -1)) out.push([x, y0, z, tone, 0], [x, y1, z, tone, 0])
  for (const y of ys.slice(1, -1)) for (const z of zs.slice(1, -1)) out.push([x0, y, z, tone, 0], [x1, y, z, tone, 0])
  return out
}

export function accent(s: Stage) {
  return new THREE.Color(s.css('--accent') || '#d97757')
}

/** Writes points into a dots buffer: position, tone, and ink or accent colour. */
export function load(d: Dots, pts: Point[], s: Stage) {
  const a = accent(s)
  const b = ink(s)
  pts.forEach(([x, y, z, tone, lit], i) => {
    d.position.setXYZ(i, x, y, z)
    d.tone.setX(i, tone)
    d.color.setXYZ(i, ...((lit ? a : b).toArray() as [number, number, number]))
  })
  d.flush()
}

export function tones(d: Dots, from: number, count: number, tone: number) {
  for (let i = from; i < from + count; i++) d.tone.setX(i, tone)
  d.tone.needsUpdate = true
}

/** The plug, its face at x = 0 pointing +x: a body, two prongs, and a status LED on top (last). */
export function plugPoints() {
  const pts: Point[] = [
    ...box(-6, 0, -3, 3, -2.2, 2.2, 0.6, 0.75),
    ...box(-TAIL, -6, -1.4, 1.4, -1.2, 1.2, 0.5, 0.6), // the strain relief where the cable enters
    ...box(0, PRONG, 0.9, 1.5, -0.3, 0.3, 0.55, 0.9),
    ...box(0, PRONG, -1.5, -0.9, -0.3, 0.3, 0.55, 0.9),
  ]
  const led = pts.length
  for (const x of [-3.6, -3, -2.4]) for (const z of [-0.5, 0.1]) pts.push([x, 3.4, z, 0.25, 1])
  return { pts, led, leds: pts.length - led }
}

/** A socket whose face is at `x`, centred on `y`: a block, two slots, a `❯` facing the camera and a ring (last). */
export function socketPoints(x: number, y = 0, height = 12) {
  const h = height / 2
  const pts = box(x, x + 4, y - h, y + h, -6, 6, 0.7, 0.55).filter(
    ([px, py, pz]) => !(px === x && Math.abs(Math.abs(py - y) - 1.2) < 0.55 && Math.abs(pz) < 0.5),
  )
  const glyph = ['##...', '.##..', '..##.', '.##..', '##...']
  glyph.forEach((row, r) =>
    [...row].forEach((c, col) => {
      if (c === '#') pts.push([x + 0.9 + col * 0.55, y + 1.4 - r * 0.7, 6.4, 1, 1])
    }),
  )
  const ring = pts.length
  for (let a = 0; a < Math.PI * 2; a += 0.16) pts.push([x - 0.2, y + Math.sin(a) * 3.6, Math.cos(a) * 3.6, 0.18, 1])
  return { pts, ring, rings: pts.length - ring }
}

/** A cable: a verlet rope from a fixed anchor, drawn as two strands of dots. */
export class Rope {
  nodes: THREE.Vector3[]
  prev: THREE.Vector3[]
  seg: number
  dots: Dots
  /** Extra pull on the last node, so a free end hangs like a weight. */
  endWeight = 1
  constructor(
    public anchor: THREE.Vector3,
    end: THREE.Vector3,
    length: number,
    private n = 30,
    private per = 3,
  ) {
    this.nodes = Array.from({ length: n }, (_, i) => anchor.clone().lerp(end, i / (n - 1)))
    this.prev = this.nodes.map((p) => p.clone())
    this.seg = length / (n - 1)
    this.dots = dots((n - 1) * per * 2)
  }

  get end() {
    return this.nodes[this.n - 1]
  }

  /** One step; `tail` pins the free end, or leave it out to let it swing. */
  step(dt: number, tail?: THREE.Vector3, gravity = 60) {
    const last = this.n - 1
    if (dt > 0) {
      for (let i = 1; i <= last; i++) {
        if (i === last && tail) continue
        const p = this.nodes[i]
        const v = p.clone().sub(this.prev[i]).multiplyScalar(0.985)
        this.prev[i].copy(p)
        p.add(v).y -= gravity * dt * dt * (i === last ? this.endWeight : 1)
      }
    }
    this.nodes[0].copy(this.anchor)
    if (tail) this.nodes[last].copy(tail)
    for (let pass = 0; pass < 14; pass++) {
      for (let i = 0; i < last; i++) {
        const a = this.nodes[i]
        const b = this.nodes[i + 1]
        const delta = b.clone().sub(a)
        const len = delta.length() || 1
        const diff = (len - this.seg) / len
        const pinA = i === 0
        const pinB = i + 1 === last && !!tail
        if (pinA && pinB) continue
        // A swinging end is heavier, so the rope moves more than it does.
        const share = pinA ? 0 : pinB ? 1 : i + 1 === last ? 0.85 : 0.5
        if (!pinA) a.addScaledVector(delta, diff * share)
        if (!pinB) b.addScaledVector(delta, -diff * (pinA ? 1 : 1 - share))
      }
    }
  }

  /** Lays the dots along the rope; `tone(f)` gets the fraction along it, 0 at the anchor. */
  draw(tone: (f: number) => number = () => 0.85) {
    let c = 0
    const total = (this.n - 1) * this.per
    for (let i = 0; i < this.n - 1; i++) {
      for (let j = 0; j < this.per; j++) {
        const p = this.nodes[i].clone().lerp(this.nodes[i + 1], j / this.per)
        const t = tone((i * this.per + j) / total)
        this.dots.position.setXYZ(c, p.x, p.y + 0.3, p.z)
        this.dots.tone.setX(c++, t)
        this.dots.position.setXYZ(c, p.x, p.y - 0.3, p.z)
        this.dots.tone.setX(c++, t)
      }
    }
    this.dots.position.needsUpdate = this.dots.tone.needsUpdate = true
  }

  paint(color: THREE.Color) {
    for (let i = 0; i < this.dots.color.count; i++) this.dots.color.setXYZ(i, color.r, color.g, color.b)
    this.dots.color.needsUpdate = true
  }
}

/** Sparks that fly out, fall and fade, alternating the accent and amber. */
export class Sparks {
  items: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number }[]
  dots: Dots
  private next = 0
  constructor(n = 160) {
    this.items = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1 }))
    this.dots = dots(n)
    this.items.forEach((_, i) => this.dots.color.setXYZ(i, ...((i % 2 ? [1, 0.69, 0] : [0.85, 0.47, 0.34]) as [number, number, number])))
  }

  /** `count` sparks from the slots of a socket face at (x, y), thrown back towards -x. */
  burst(x: number, y: number, count: number, power = 1) {
    for (let k = 0; k < count; k++) {
      const spark = this.items[this.next]
      this.next = (this.next + 1) % this.items.length
      spark.p.set(x - 0.2, y + (Math.random() < 0.5 ? 1 : -1) * 1.2, 0)
      spark.v.set((-Math.random() * 18 - 4) * power, (Math.random() * 22 - 6) * power, (Math.random() - 0.5) * 18 * power)
      spark.max = spark.life = 0.5 + Math.random() * 0.7
    }
  }

  step(dt: number) {
    this.items.forEach((spark, i) => {
      if (spark.life > 0) {
        spark.life -= dt
        spark.v.y -= 40 * dt
        spark.p.addScaledVector(spark.v, dt)
      }
      this.dots.position.setXYZ(i, spark.p.x, spark.p.y, spark.p.z)
      this.dots.tone.setX(i, Math.max(0, spark.life / spark.max))
    })
    this.dots.flush()
  }
}

/** A caption under the scene that types itself; returns the function that sets it. */
export function caption(host: HTMLElement, hidden = false) {
  const msg = document.createElement('p')
  msg.className = hidden ? 'hero-msg sr-only' : 'hero-msg'
  msg.setAttribute('aria-live', 'polite')
  host.appendChild(msg)
  let typing = 0
  return (text: string) => {
    const id = ++typing
    if (reduced) return void (msg.textContent = text)
    let i = 0
    const tick = () => {
      if (id !== typing) return
      msg.textContent = text.slice(0, ++i)
      if (i < text.length) setTimeout(tick, 32)
    }
    tick()
  }
}
