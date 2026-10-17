// Header option "orbit": a core of dots with modules circling it on tilted
// rings. Drag to spin the system (it keeps its momentum); point at a module to
// pick it out, click it and it docks into the core with a flash while a new
// one flies in from deep space.
import { THREE, dots, fit, ink, reduced, run, scanY, stage, type Dots } from './dots'

const RINGS = [
  { radius: 12, tilt: new THREE.Euler(0.35, 0, 0.2), speed: 0.55 },
  { radius: 16.5, tilt: new THREE.Euler(-0.5, 0, -0.35), speed: 0.38 },
  { radius: 21, tilt: new THREE.Euler(0.15, 0, 0.55), speed: 0.26 },
]
const MODULES = 7
const TRAIL = 22

function cube(size: number, gap: number): number[][] {
  const out: number[][] = []
  const h = size / 2
  const n = Math.round(size / gap)
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const u = -h + (size * i) / n
      const v = -h + (size * j) / n
      out.push([u, v, -h], [u, v, h], [u, -h, v], [u, h, v], [-h, u, v], [h, u, v])
    }
  }
  return out
}

interface Module {
  ring: number
  phase: number
  dots: Dots
  holder: THREE.Group
  trail: THREE.Vector3[]
  state: 'orbit' | 'docking' | 'arriving'
  since: number
  start: THREE.Vector3
}

export function mount(host: HTMLElement) {
  const system = new THREE.Group()

  // The core: a Fibonacci sphere, and an equator in the accent.
  const corePts: { p: number[]; accent: boolean; tone: number }[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < 900; i++) {
    const y = 1 - (i / 899) * 2
    const r = Math.sqrt(1 - y * y)
    corePts.push({ p: [Math.cos(golden * i) * r * 6, y * 6, Math.sin(golden * i) * r * 6], accent: false, tone: 0.55 })
  }
  for (let a = 0; a < Math.PI * 2; a += 0.07) corePts.push({ p: [Math.cos(a) * 7.4, 0, Math.sin(a) * 7.4], accent: true, tone: 0.9 })
  // The rings, as faint dotted circles.
  RINGS.forEach((ring) => {
    for (let a = 0; a < Math.PI * 2; a += 0.035) {
      const v = new THREE.Vector3(Math.cos(a) * ring.radius, 0, Math.sin(a) * ring.radius).applyEuler(ring.tilt)
      corePts.push({ p: [v.x, v.y, v.z], accent: false, tone: 0.16 })
    }
  })
  const core = dots(corePts.length)
  corePts.forEach((c, i) => {
    core.position.setXYZ(i, c.p[0], c.p[1], c.p[2])
    core.tone.setX(i, c.tone)
  })
  system.add(core.points)

  // A flash ring that expands out of the core when a module docks.
  const FLASH = 120
  const flash = dots(FLASH)
  system.add(flash.points)
  let flashAt = -10

  // Stars far behind, turning slower than the system.
  const stars = dots(500)
  for (let i = 0; i < 500; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(90 + Math.random() * 60)
    stars.position.setXYZ(i, v.x, v.y, v.z)
    stars.tone.setX(i, 0.15 + Math.random() * 0.35)
  }

  const shape = cube(1.8, 0.45)
  const modules: Module[] = Array.from({ length: MODULES }, (_, i) => {
    const d = dots(shape.length + TRAIL)
    shape.forEach((p, k) => {
      d.position.setXYZ(k, p[0], p[1], p[2])
      d.tone.setX(k, 0.85)
    })
    const holder = new THREE.Group()
    holder.add(d.points)
    system.add(holder)
    return {
      ring: i % RINGS.length,
      phase: (i / MODULES) * Math.PI * 2 * 1.7,
      dots: d,
      holder,
      trail: [],
      state: 'orbit' as const,
      since: 0,
      start: new THREE.Vector3(),
    }
  })

  const all = [core, flash, stars, ...modules.map((m) => m.dots)]
  const s = stage(host, (s) => {
    const ppu = fit(s, 50, 44, 0.98)
    for (const d of all) d.size(ppu * 0.3, s)
    stars.size(ppu * 0.4, s)
    flash.size(ppu * 0.45, s)
  })
  s.scene.add(system, stars.points)

  const paint = () => {
    const a = new THREE.Color(s.css('--accent') || '#d97757')
    const b = ink(s)
    corePts.forEach((c, i) => core.color.setXYZ(i, ...((c.accent ? a : b).toArray() as [number, number, number])))
    for (let i = 0; i < FLASH; i++) flash.color.setXYZ(i, a.r, a.g, a.b)
    for (let i = 0; i < 500; i++) stars.color.setXYZ(i, b.r, b.g, b.b)
    for (const m of modules) for (let i = 0; i < m.dots.color.count; i++) m.dots.color.setXYZ(i, b.r, b.g, b.b)
    for (const d of all) d.flush()
  }
  paint()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint)

  const msg = document.createElement('p')
  msg.className = 'hero-msg'
  msg.setAttribute('aria-live', 'polite')
  host.appendChild(msg)
  let docked = 0
  msg.textContent = '❯ drag to spin · click a module'

  // Dragging spins the system; the spin keeps going and slows down.
  const spin = { x: 0.25, y: 0, vx: 0, vy: 0.12 }
  let drag: { x: number; y: number; moved: number } | null = null
  host.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0 }
    host.setPointerCapture(e.pointerId)
  })
  host.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    drag = { x: e.clientX, y: e.clientY, moved: drag.moved + Math.abs(dx) + Math.abs(dy) }
    spin.vy = dx * 0.25
    spin.vx = dy * 0.18
  })
  host.addEventListener('pointerup', () => {
    const wasClick = drag && drag.moved < 6
    drag = null
    if (wasClick && hover >= 0) dock(modules[hover])
  })

  let clock = 0
  const dock = (m: Module) => {
    if (m.state !== 'orbit') return
    m.state = 'docking'
    m.since = clock
    m.start.copy(m.holder.position)
  }

  let hover = -1
  const world = new THREE.Vector3()
  const ringPos = (m: Module, t: number) => {
    const ring = RINGS[m.ring]
    const a = m.phase + t * ring.speed
    return new THREE.Vector3(Math.cos(a) * ring.radius, 0, Math.sin(a) * ring.radius).applyEuler(ring.tilt)
  }

  run(s, (t, dt) => {
    clock = t
    if (!drag) {
      spin.vy += (0.12 - spin.vy) * Math.min(1, dt * 0.8)
      spin.vx *= Math.max(0, 1 - dt * 2)
    }
    spin.y += spin.vy * dt
    spin.x = THREE.MathUtils.clamp(spin.x + spin.vx * dt, -0.9, 0.9)
    system.rotation.set(spin.x, spin.y, 0)
    stars.points.rotation.y = spin.y * 0.2

    // The module nearest the pointer on screen, within 40 px.
    hover = -1
    if (s.pointer.inside && !drag) {
      let best = 40
      modules.forEach((m, i) => {
        if (m.state !== 'orbit') return
        m.holder.getWorldPosition(world).project(s.camera)
        const dist = Math.hypot(((world.x - s.pointer.x) * s.width) / 2, ((world.y - s.pointer.y) * s.height) / 2)
        if (dist < best) {
          best = dist
          hover = i
        }
      })
    }
    host.style.cursor = drag ? 'grabbing' : hover >= 0 ? 'pointer' : 'grab'

    const a = new THREE.Color(s.css('--accent') || '#d97757')
    const b = ink(s)
    modules.forEach((m, i) => {
      const k = Math.min(1, (t - m.since) / (m.state === 'docking' ? 0.7 : 1.6))
      if (m.state === 'orbit') m.holder.position.copy(ringPos(m, t))
      else if (m.state === 'docking') {
        m.holder.position.copy(m.start).multiplyScalar(1 - k * k)
        m.holder.scale.setScalar(1 - k * 0.8)
        if (k >= 1) {
          docked++
          flashAt = t
          msg.textContent = `✓ docked · ${docked} loaded`
          // Respawn far out, then fly onto the ring.
          m.state = 'arriving'
          m.since = t
          m.phase += Math.PI * (0.6 + Math.random())
          m.start.copy(new THREE.Vector3().randomDirection().multiplyScalar(70))
          m.trail.length = 0
        }
      } else {
        const e = 1 - Math.pow(1 - k, 3)
        m.holder.position.copy(m.start).lerp(ringPos(m, t), e)
        m.holder.scale.setScalar(0.2 + e * 0.8)
        if (k >= 1) m.state = 'orbit'
      }
      if (m.state !== 'docking') m.holder.scale.setScalar(i === hover ? 1.6 : m.state === 'orbit' ? 1 : m.holder.scale.x)
      m.holder.rotation.set(t * 0.7 + i, t * 0.9 + i * 2, 0)

      // The trail, in the module's own space so it can share its buffer.
      if (!reduced && dt > 0) m.trail.unshift(m.holder.position.clone())
      if (m.trail.length > TRAIL) m.trail.length = TRAIL
      m.holder.updateMatrix()
      const inverse = m.holder.matrix.clone().invert()
      for (let j = 0; j < TRAIL; j++) {
        const at = m.trail[j] ?? m.holder.position
        const local = at.clone().applyMatrix4(inverse)
        m.dots.position.setXYZ(shape.length + j, local.x, local.y, local.z)
        m.dots.tone.setX(shape.length + j, m.trail[j] ? (1 - j / TRAIL) * 0.6 : 0)
      }
      const col = i === hover ? a : b
      for (let j = 0; j < shape.length + TRAIL; j++) m.dots.color.setXYZ(j, col.r, col.g, col.b)
      m.dots.flush()
    })

    // The flash: a ring of dots racing out of the core, fading.
    const age = t - flashAt
    for (let i = 0; i < FLASH; i++) {
      const ang = (i / FLASH) * Math.PI * 2
      const r = 7 + age * 30
      flash.position.setXYZ(i, Math.cos(ang) * r, Math.sin(ang * 3) * 0.6, Math.sin(ang) * r)
      flash.tone.setX(i, age < 0.9 ? 1 - age / 0.9 : 0)
    }
    flash.flush()
    core.material.uniforms.uScan.value = scanY(t, 8, -8, 4)
  })
}
