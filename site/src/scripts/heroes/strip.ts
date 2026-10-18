// Header option "strip": a power strip with four outlets. Each plug you bring
// in stays in, and a new one on its own cable drifts in for the next outlet;
// the caption counts them. With every outlet full, a click pulls them all out.
import { THREE, dots, fit, ink, reduced, run, scanY, stage, type Dots, type Stage } from './dots'
import { Rope, Sparks, TAIL, box, caption, load, plugPoints, tones, type Point } from './kit'

const SX = 14 // the strip's face
const OUTLETS = [9.75, 3.25, -3.25, -9.75]
const RING = 2.6

function stripPoints() {
  const pts: Point[] = box(SX, SX + 4, -13, 13, -5, 5, 0.7, 0.5).filter(
    ([x, y, z]) => !(x === SX && OUTLETS.some((oy) => Math.abs(Math.abs(y - oy) - 1.2) < 0.55) && Math.abs(z) < 0.5),
  )
  // The strip's own lead, running off the bottom.
  for (let y = -13.5; y > -40; y -= 0.5) pts.push([SX + 2, y, 0, 0.6, 0])
  const glyph = ['##...', '.##..', '..##.', '.##..', '##...']
  glyph.forEach((row, r) =>
    [...row].forEach((c, col) => {
      if (c === '#') pts.push([SX + 0.9 + col * 0.5, 15.8 - r * 0.5 - 2.8, 5.4, 1, 1])
    }),
  )
  const rings = OUTLETS.map((oy) => {
    const from = pts.length
    for (let a = 0; a < Math.PI * 2; a += 0.2) pts.push([SX - 0.2, oy + Math.sin(a) * RING, Math.cos(a) * RING, 0.15, 1])
    return { from, count: pts.length - from }
  })
  return { pts, rings }
}

interface Plug {
  holder: THREE.Group
  dots: Dots
  rope: Rope
  at: THREE.Vector3
  vel: THREE.Vector3
  state: 'free' | 'flying' | 'plugged' | 'leaving'
  outlet: number
  since: number
}

export function mount(host: HTMLElement) {
  const group = new THREE.Group()
  group.rotation.y = 0.42
  const shape = plugPoints()
  const strip = stripPoints()
  const stripDots = dots(strip.pts.length)
  group.add(stripDots.points)
  const sparks = new Sparks(240)
  group.add(sparks.dots.points)

  let ppu = 1
  let idleX = -14
  const plugs: Plug[] = []
  const sizeAll = (s: Stage) => {
    stripDots.size(ppu * 0.24, s)
    sparks.dots.size(ppu * 0.5, s)
    for (const p of plugs) {
      p.dots.size(ppu * 0.24, s)
      p.rope.dots.size(ppu * 0.28, s)
    }
  }
  const s = stage(host, (s) => {
    const narrow = s.width < 640
    idleX = narrow ? -6 : -14
    group.position.set(narrow ? -3 : 5, 0, 0)
    ppu = fit(s, narrow ? 42 : 66, 32, 0.98)
    sizeAll(s)
  })
  s.scene.add(group)
  load(stripDots, strip.pts, s)

  const say = caption(host)
  const filled = () => plugs.filter((p) => p.state === 'plugged').length
  const status = () => {
    const n = filled()
    say(n === OUTLETS.length ? `✓ ${n} plugins loaded · click to unplug all` : n ? `✓ ${n} plugin${n === 1 ? '' : 's'} loaded` : '❯ plug it in')
  }

  // A fresh plug on its own cable, drifting in from the top left.
  const spawn = () => {
    const k = plugs.length
    const anchor = new THREE.Vector3(-42 + k * 2.5, 18 + (k % 2) * 1.5, -k * 0.8)
    const lowest = new THREE.Vector3(SX - TAIL, OUTLETS[OUTLETS.length - 1], 0)
    const rope = new Rope(anchor, anchor.clone().add(new THREE.Vector3(6, -8, 0)), anchor.distanceTo(lowest) * 1.2, 28)
    const d = dots(shape.pts.length)
    const holder = new THREE.Group()
    holder.add(d.points)
    group.add(holder, rope.dots.points)
    load(d, shape.pts, s)
    rope.paint(ink(s))
    const p: Plug = {
      holder,
      dots: d,
      rope,
      at: anchor.clone().add(new THREE.Vector3(10, -6, 0)),
      vel: new THREE.Vector3(),
      state: 'free',
      outlet: -1,
      since: 0,
    }
    plugs.push(p)
    sizeAll(s)
    return p
  }
  spawn()
  status()

  let clock = 0
  const freeOutlets = () => OUTLETS.map((_, i) => i).filter((i) => !plugs.some((p) => p.state === 'plugged' && p.outlet === i))
  const nearestOutlet = (y: number) => freeOutlets().sort((a, b) => Math.abs(OUTLETS[a] - y) - Math.abs(OUTLETS[b] - y))[0]

  const connect = (p: Plug, outlet: number) => {
    p.state = 'plugged'
    p.outlet = outlet
    tones(p.dots, shape.led, shape.leds, 1)
    tones(stripDots, strip.rings[outlet].from, strip.rings[outlet].count, 1)
    sparks.burst(SX, OUTLETS[outlet], 70)
    status()
    if (filled() < OUTLETS.length) setTimeout(spawn, reduced ? 0 : 500)
  }

  host.addEventListener('click', () => {
    const free = plugs.find((p) => p.state === 'free')
    if (free) {
      const outlet = nearestOutlet(free.at.y)
      if (reduced) return connect(free, outlet)
      free.state = 'flying'
      free.outlet = outlet
      return
    }
    if (filled() < OUTLETS.length) return
    // Every outlet is full: pull them all out, one after another.
    plugs.forEach((p, i) =>
      setTimeout(() => {
        p.state = 'leaving'
        p.since = clock
        p.vel.set(-30, 10, 0)
        tones(stripDots, strip.rings[p.outlet].from, strip.rings[p.outlet].count, 0.15)
        sparks.burst(SX, OUTLETS[p.outlet], 30)
        if (i === plugs.length - 1) setTimeout(spawn, 700)
        status()
      }, i * 140),
    )
  })

  const target = new THREE.Vector3()
  const redraw = run(s, (t, dt) => {
    clock = t
    group.rotation.y += (0.42 + (s.pointer.inside ? s.pointer.x : 0) * 0.12 - group.rotation.y) * 0.05
    group.rotation.x += ((s.pointer.inside ? -s.pointer.y : 0) * 0.08 - group.rotation.x) * 0.05
    const m = s.pointer.inside ? s.hit(group) : null

    for (let i = plugs.length - 1; i >= 0; i--) {
      const p = plugs[i]
      if (p.state === 'plugged') target.set(SX, OUTLETS[p.outlet], 0)
      else if (p.state === 'flying') target.set(SX - 3, OUTLETS[p.outlet], 0)
      else if (p.state === 'leaving') target.copy(p.rope.anchor).add(new THREE.Vector3(4, -4, 0))
      else if (m) target.set(Math.min(m.x, SX - 3.2), THREE.MathUtils.clamp(m.y, -13, 13), 0)
      else target.set(idleX, -2 + Math.sin(t * 1.3) * 1.2, 0)

      if (dt > 0) {
        p.vel.addScaledVector(target.clone().sub(p.at), (p.state === 'plugged' ? 220 : p.state === 'flying' ? 150 : 60) * dt)
        p.vel.multiplyScalar(Math.max(0, 1 - 8 * dt))
        p.at.addScaledVector(p.vel, dt)
        if (p.state === 'free' || p.state === 'flying') {
          const o = p.state === 'flying' ? p.outlet : nearestOutlet(p.at.y)
          if (o !== undefined && Math.hypot(p.at.x - (SX - 3), p.at.y - OUTLETS[o]) < (p.state === 'flying' ? 0.8 : 2.2)) {
            p.at.set(SX - 3, OUTLETS[o], 0)
            connect(p, o)
          }
        }
      }
      // Gone off the top: drop it.
      if (p.state === 'leaving' && t - p.since > 1.4) {
        group.remove(p.holder, p.rope.dots.points)
        plugs.splice(i, 1)
        continue
      }
      p.holder.position.copy(p.at)
      const moving = p.state !== 'plugged'
      p.holder.rotation.z = moving ? THREE.MathUtils.clamp(-p.vel.y * 0.012, -0.5, 0.5) : 0
      p.holder.rotation.y = moving ? THREE.MathUtils.clamp(p.vel.x * 0.004, -0.2, 0.2) : 0
      p.rope.step(dt, new THREE.Vector3(-TAIL, 0, 0).applyEuler(p.holder.rotation).add(p.at))
      p.rope.draw()
      p.dots.material.uniforms.uScan.value = scanY(t, 16, -16, 5) - p.at.y
    }
    sparks.step(dt)
    stripDots.material.uniforms.uScan.value = scanY(t, 16, -16, 5)
  })
  if (reduced) redraw()
}
