// Header option "circuit": a circuit board of dots seen at an angle, a `❯`
// chip in the middle and expansion slots around it. Pulses run along the
// traces; a click drops a card into a slot (or pulls it out) and the slot's
// trace lights up.
import { THREE, dots, fit, ink, reduced, run, scanY, stage, type Dots } from './dots'

const SLOTS = [-1, 1].flatMap((side) => [-9, 0, 9].map((y) => ({ x: side * 22, y, side })))
const GLYPH = ['##...', '.##..', '..##.', '.##..', '##...']

interface Dot {
  x: number
  y: number
  z: number
  tone: number
  accent: boolean
}

interface Trace {
  from: number // first dot index in the board buffer
  dots: number[] // distance along the trace for each dot
  length: number
  slot: number
}

function line(out: Dot[], a: number[], b: number[], tone: number, gap = 0.5) {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / gap))
  for (let i = 0; i <= n; i++) out.push({ x: a[0] + ((b[0] - a[0]) * i) / n, y: a[1] + ((b[1] - a[1]) * i) / n, z: 0, tone, accent: false })
}

function rect(out: Dot[], x0: number, y0: number, x1: number, y1: number, tone: number) {
  line(out, [x0, y0], [x1, y0], tone)
  line(out, [x1, y0], [x1, y1], tone)
  line(out, [x1, y1], [x0, y1], tone)
  line(out, [x0, y1], [x0, y0], tone)
}

function card(): Dots {
  const pts: number[][] = []
  for (let y = -3.2; y <= 3.2; y += 0.45) for (let z = 0; z <= 5; z += 0.45) pts.push([-0.4, y, z], [0.4, y, z])
  for (let y = -3.2; y <= 3.2; y += 0.45) pts.push([0, y, 5.2]) // the card's top edge
  const d = dots(pts.length)
  pts.forEach((p, i) => {
    d.position.setXYZ(i, p[0], p[1], p[2])
    d.tone.setX(i, p[2] > 5 ? 1 : 0.6)
  })
  d.flush()
  return d
}

export function mount(host: HTMLElement) {
  const board: Dot[] = []
  // The board's texture: a sparse grid.
  for (let x = -30; x <= 30; x += 2) for (let y = -15; y <= 15; y += 2) board.push({ x, y, z: 0, tone: 0.12, accent: false })
  // The chip: a raised square with pins, and `❯` on top.
  for (let x = -5; x <= 5; x += 0.5) for (let y = -5; y <= 5; y += 0.5) board.push({ x, y, z: 0.6, tone: 0.22, accent: false })
  for (let p = -4; p <= 4; p += 1.3) {
    line(board, [-6.2, p], [-5, p], 0.8)
    line(board, [5, p], [6.2, p], 0.8)
    line(board, [p, -6.2], [p, -5], 0.8)
    line(board, [p, 5], [p, 6.2], 0.8)
  }
  GLYPH.forEach((row, r) =>
    [...row].forEach((c, col) => {
      if (c === '#') board.push({ x: -2.4 + col * 1.1, y: 2.2 - r * 1.1, z: 1.4, tone: 1, accent: true })
    }),
  )
  // The slots and their status LEDs.
  const leds: number[] = []
  SLOTS.forEach((slot) => {
    rect(board, slot.x - 1.1, slot.y - 3.8, slot.x + 1.1, slot.y + 3.8, 0.6)
    leds.push(board.length)
    for (const dy of [0, 0.6]) board.push({ x: slot.x + slot.side * 2.4, y: slot.y + 3.4 - dy, z: 0, tone: 0.25, accent: true })
  })
  // The traces: out of the chip, along, then into each slot.
  const traces: Trace[] = SLOTS.map((slot, i) => {
    const start = board.length
    const pin = slot.y * 0.4
    const pts = [
      [slot.side * 6.2, pin],
      [slot.side * 11, pin],
      [slot.side * 14, slot.y],
      [slot.x - slot.side * 1.1, slot.y],
    ]
    for (let k = 0; k < pts.length - 1; k++) line(board, pts[k], pts[k + 1], 0.3)
    const along: number[] = []
    let dist = 0
    for (let k = start; k < board.length; k++) {
      if (k > start) dist += Math.hypot(board[k].x - board[k - 1].x, board[k].y - board[k - 1].y)
      along.push(dist)
    }
    return { from: start, dots: along, length: dist, slot: i }
  })

  const d = dots(board.length)
  board.forEach((p, i) => {
    d.position.setXYZ(i, p.x, p.y, p.z)
    d.tone.setX(i, p.tone)
  })
  const group = new THREE.Group()
  group.rotation.x = -0.95
  group.add(d.points)

  const cards = SLOTS.map((slot) => {
    const c = card()
    const holder = new THREE.Group()
    holder.position.set(slot.x, slot.y, 0)
    holder.add(c.points)
    holder.visible = false
    group.add(holder)
    return { dots: c, holder, filled: false, since: -10 }
  })

  const s = stage(host, (s) => {
    const ppu = fit(s, s.width < 640 ? 54 : 66, 34, 0.98)
    d.size(ppu * 0.3, s)
    for (const c of cards) c.dots.size(ppu * 0.26, s)
  })
  s.scene.add(group)

  const paint = () => {
    const a = new THREE.Color(s.css('--accent') || '#d97757')
    const b = ink(s)
    board.forEach((p, i) => d.color.setXYZ(i, ...((p.accent ? a : b).toArray() as [number, number, number])))
    for (const c of cards) for (let i = 0; i < c.dots.color.count; i++) c.dots.color.setXYZ(i, b.r, b.g, b.b)
    d.flush()
    for (const c of cards) c.dots.flush()
  }
  paint()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint)

  const msg = document.createElement('p')
  msg.className = 'hero-msg'
  msg.setAttribute('aria-live', 'polite')
  host.appendChild(msg)
  const count = () => {
    const n = cards.filter((c) => c.filled).length
    msg.textContent = n ? `✓ ${n} plugin${n === 1 ? '' : 's'} loaded` : '❯ click to plug a card in'
  }
  count()

  let clock = 0
  const hovered = () => {
    const m = s.pointer.inside ? s.hit(group) : null
    return m ? SLOTS.findIndex((slot) => Math.abs(m.x - slot.x) < 3 && Math.abs(m.y - slot.y) < 5) : -1
  }
  host.addEventListener('click', () => {
    let i = hovered()
    if (i < 0) i = cards.findIndex((c) => !c.filled)
    if (i < 0) i = Math.floor(Math.random() * cards.length)
    const c = cards[i]
    c.filled = !c.filled
    c.since = clock
    c.holder.visible = true
    const tone = d.tone
    for (const k of [leds[i], leds[i] + 1]) tone.setX(k, c.filled ? 1 : 0.25)
    tone.needsUpdate = true
    count()
  })

  run(s, (t) => {
    clock = t
    const px = s.pointer.inside ? s.pointer.x : 0
    const py = s.pointer.inside ? s.pointer.y : 0
    group.rotation.x += (-0.95 - py * 0.12 - group.rotation.x) * 0.05
    group.rotation.z += (px * 0.12 - group.rotation.z) * 0.05
    host.style.cursor = hovered() >= 0 ? 'pointer' : 'crosshair'

    // Pulses: a bright packet running chip → slot; filled slots run faster and in the accent.
    const hot = hovered()
    const a = new THREE.Color(s.css('--accent') || '#d97757')
    const b = ink(s)
    for (const trace of traces) {
      const filled = cards[trace.slot].filled
      const speed = filled ? 26 : 9
      const head = ((t * speed + trace.slot * 7) % (trace.length + 8)) - 4
      trace.dots.forEach((along, j) => {
        const k = trace.from + j
        const pulse = reduced ? 0 : Math.exp(-(((along - head) / 1.4) ** 2))
        d.tone.setX(k, Math.min(1, (filled || trace.slot === hot ? 0.55 : 0.3) + pulse * 0.8))
        const col = filled ? a : b
        d.color.setXYZ(k, col.r, col.g, col.b)
      })
    }
    d.tone.needsUpdate = d.color.needsUpdate = true

    // Cards drop in with a bounce, or lift out and vanish.
    for (const c of cards) {
      const k = Math.min(1, (t - c.since) / 0.6)
      if (c.filled) {
        const bounce = 1 - Math.pow(1 - k, 3) * Math.cos(k * 9) * 1
        c.holder.position.z = reduced ? 0 : 14 * (1 - bounce)
      } else {
        c.holder.position.z = 14 * k
        if (k >= 1) c.holder.visible = false
      }
    }
    d.material.uniforms.uScan.value = scanY(t, 16, -16, 5)
  })
}
