// Header option "morph": one cloud of dots that becomes a plug, a puzzle
// piece, the prompt `❯_` and a stack of blocks in turn, each with a caption.
// A click moves on; the pointer scatters the dots, which spring back.
import { THREE, dots, fit, ink, reduced, run, scanY, stage } from './dots'

const N = 4200
const HOLD = 4.2 // seconds a shape stays before the next
const MORPH = 1.3

type Box = [x0: number, x1: number, y0: number, y1: number, z0: number, z1: number]

// N points spread over the faces of some boxes, weighted by area.
function boxes(list: Box[], n: number, out = new Float32Array(n * 3), from = 0) {
  const faces: { area: number; at: (u: number, v: number) => number[] }[] = []
  for (const [x0, x1, y0, y1, z0, z1] of list) {
    const dx = x1 - x0
    const dy = y1 - y0
    const dz = z1 - z0
    for (const z of [z0, z1]) faces.push({ area: dx * dy, at: (u, v) => [x0 + u * dx, y0 + v * dy, z] })
    for (const y of [y0, y1]) faces.push({ area: dx * dz, at: (u, v) => [x0 + u * dx, y, z0 + v * dz] })
    for (const x of [x0, x1]) faces.push({ area: dy * dz, at: (u, v) => [x, y0 + u * dy, z0 + v * dz] })
  }
  const total = faces.reduce((a, f) => a + f.area, 0)
  for (let i = from; i < from + n; i++) {
    let r = Math.random() * total
    const face = faces.find((f) => (r -= f.area) <= 0) ?? faces[faces.length - 1]
    out.set(face.at(Math.random(), Math.random()), i * 3)
  }
  return out
}

// N points inside a 2D drawing, extruded `depth` deep; `size` world units across.
function drawn(draw: (ctx: CanvasRenderingContext2D) => void, size: number, depth: number) {
  const px = 360
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = px
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  draw(ctx)
  const data = ctx.getImageData(0, 0, px, px).data
  const filled: number[] = []
  for (let i = 0; i < px * px; i++) if (data[i * 4 + 3] > 128) filled.push(i)
  const out = new Float32Array(N * 3)
  const k = size / px
  for (let i = 0; i < N; i++) {
    const p = filled[Math.floor(Math.random() * filled.length)]
    const edge = Math.random() < 0.5 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() * 2 - 1
    out.set([((p % px) - px / 2 + Math.random()) * k, (px / 2 - Math.floor(p / px)) * k, (edge * depth) / 2], i * 3)
  }
  return out
}

function plug() {
  const out = boxes(
    [
      [-3, 5, -4, 4, -3, 3], // body
      [5, 9, 1.2, 2.1, -0.5, 0.5], // prongs
      [5, 9, -2.1, -1.2, -0.5, 0.5],
      [-5, -3, -2, 2, -1.6, 1.6], // strain relief
    ],
    Math.floor(N * 0.8),
    new Float32Array(N * 3), // room for the cable below
  )
  // The cable: a tube along a curve that drops away to the left.
  for (let i = Math.floor(N * 0.8); i < N; i++) {
    const t = Math.random()
    const a = Math.random() * Math.PI * 2
    const x = -5 - t * 13
    const y = -Math.pow(t, 1.6) * 6
    out.set([x, y + Math.cos(a) * 0.7, Math.sin(a) * 0.7], i * 3)
  }
  return out
}

function puzzle() {
  return drawn(
    (ctx) => {
      ctx.beginPath()
      ctx.roundRect(70, 90, 200, 200, 18)
      ctx.moveTo(308, 190)
      ctx.arc(270, 190, 38, 0, Math.PI * 2) // the knob on the right
      ctx.moveTo(208, 90)
      ctx.arc(170, 90, 38, 0, Math.PI * 2) // the knob on top
      ctx.fill('nonzero')
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(70, 190, 36, 0, Math.PI * 2) // the socket on the left
      ctx.moveTo(206, 290)
      ctx.arc(170, 290, 36, 0, Math.PI * 2) // and at the bottom
      ctx.fill()
    },
    26,
    3,
  )
}

function prompt() {
  return drawn(
    (ctx) => {
      ctx.font = '700 230px "Geist Mono"'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('❯_', 180, 175)
    },
    30,
    4,
  )
}

function stack() {
  return boxes(
    [
      [-11, -1, -7, -1, -3, 3],
      [1, 11, -7, -1, -3, 3],
      [-5, 5, 1, 7, -3, 3],
    ],
    N,
  )
}

export async function mount(host: HTMLElement) {
  await document.fonts.load('700 230px "Geist Mono"')
  const shapes = [
    { pts: plug(), caption: '❯ plug in' },
    { pts: puzzle(), caption: '❯ fits your workflow' },
    { pts: prompt(), caption: '❯ right above your prompt' },
    { pts: stack(), caption: '❯ stack as many as you like' },
  ]
  // Each shape gets its own shuffle, so dots travel across the cloud between shapes.
  for (const shape of shapes) {
    for (let i = N - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      for (let c = 0; c < 3; c++) {
        const tmp = shape.pts[i * 3 + c]
        shape.pts[i * 3 + c] = shape.pts[j * 3 + c]
        shape.pts[j * 3 + c] = tmp
      }
    }
  }

  const d = dots(N)
  const group = new THREE.Group()
  group.add(d.points)
  const s = stage(host, (s) => d.size(fit(s, 46, 26, 0.95) * 0.15, s))
  s.scene.add(group)

  const accent = new Uint8Array(N).map(() => (Math.random() < 0.12 ? 1 : 0))
  const paint = () => {
    const a = new THREE.Color(s.css('--accent') || '#d97757')
    const b = ink(s)
    for (let i = 0; i < N; i++) {
      d.color.setXYZ(i, ...((accent[i] ? a : b).toArray() as [number, number, number]))
      d.tone.setX(i, accent[i] ? 1 : 0.55 + Math.random() * 0.4)
    }
    d.flush()
  }
  paint()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint)

  const msg = document.createElement('p')
  msg.className = 'hero-msg'
  msg.setAttribute('aria-live', 'polite')
  host.appendChild(msg)

  const pos = d.position.array as Float32Array
  const from = new Float32Array(N * 3)
  const bend = new Float32Array(N * 3).map(() => (Math.random() - 0.5) * 18)
  const delay = new Float32Array(N).map(() => Math.random() * 0.4)
  const push = new Float32Array(N * 3) // the pointer's push, springing back to zero
  const pushVel = new Float32Array(N * 3)
  let shape = 0
  let since = 0 // when the current morph began
  // Start from a loose sphere, so the first shape assembles out of nothing.
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20)
    from.set([v.x, v.y, v.z], i * 3)
  }
  if (reduced) pos.set(shapes[0].pts)
  msg.textContent = shapes[0].caption

  const go = (t: number, next: number) => {
    from.set(pos)
    shape = next
    since = t
    msg.textContent = shapes[shape].caption
  }
  let clock = 0
  host.addEventListener('click', () => go(clock, (shape + 1) % shapes.length))

  run(s, (t, dt) => {
    clock = t
    if (reduced) return
    if (since === 0) since = t
    if (t - since > HOLD + MORPH) go(t, (shape + 1) % shapes.length)

    const target = shapes[shape].pts
    const m = s.pointer.inside ? s.hit(group) : null
    for (let i = 0; i < N; i++) {
      const k = i * 3
      const p = THREE.MathUtils.smoothstep((t - since - delay[i]) / MORPH, 0, 1)
      const q = 1 - p
      for (let c = 0; c < 3; c++) {
        // A quadratic curve through a bent midpoint, so dots swirl rather than slide.
        const mid = (from[k + c] + target[k + c]) / 2 + bend[k + c]
        let a = -push[k + c] * 40
        if (m && c < 2) {
          const dx = pos[k] - m.x
          const dy = pos[k + 1] - m.y
          const dist = Math.hypot(dx, dy)
          if (dist < 5 && dist > 0.01) a += ((c === 0 ? dx : dy) / dist) * (1 - dist / 5) ** 2 * 900
        }
        pushVel[k + c] = (pushVel[k + c] + a * dt) * Math.max(0, 1 - 7 * dt)
        push[k + c] += pushVel[k + c] * dt
        pos[k + c] = q * q * from[k + c] + 2 * q * p * mid + p * p * target[k + c] + push[k + c]
      }
    }
    d.position.needsUpdate = true

    const px = s.pointer.inside ? s.pointer.x : 0
    const py = s.pointer.inside ? s.pointer.y : 0
    group.rotation.y += (Math.sin(t * 0.35) * 0.45 + px * 0.35 - group.rotation.y) * 0.05
    group.rotation.x += (-py * 0.25 + 0.1 - group.rotation.x) * 0.05
    d.material.uniforms.uScan.value = scanY(t, 12, -12, 5)
  })
}
