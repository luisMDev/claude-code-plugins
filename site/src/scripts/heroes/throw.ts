// Header option "throw": the plug hangs from a hook on its cable and swings
// like a pendulum. Grab it, drag it and let go to throw it; land the prongs
// in the socket and it plugs in. A tap tosses it in for you; a tap while it
// is in pulls it out.
import { THREE, dots, fit, ink, reduced, run, scanY, stage } from './dots'
import { PRONG, Rope, Sparks, TAIL, box, caption, load, plugPoints, socketPoints, tones } from './kit'

const SX = 14
const HOOK = new THREE.Vector3(0, 15, 0) // close enough that the cable reaches the socket
const MOUTH = new THREE.Vector3(SX - 3, 0, 0) // where the plug sits just before going in

export function mount(host: HTMLElement) {
  const group = new THREE.Group()
  group.rotation.y = 0.35

  const shape = plugPoints()
  const plug = new THREE.Group()
  const plugDots = dots(shape.pts.length)
  plug.add(plugDots.points)
  group.add(plug)

  const socket = socketPoints(SX)
  // The hook in the ceiling the cable hangs from.
  const hookPts = [...box(HOOK.x - 2, HOOK.x + 2, HOOK.y + 0.6, HOOK.y + 1.2, -1, 1, 0.5, 0.8), ...box(HOOK.x - 0.3, HOOK.x + 0.3, HOOK.y, HOOK.y + 0.6, -0.3, 0.3, 0.3, 0.8)]
  const fixed = dots(socket.pts.length + hookPts.length)
  group.add(fixed.points)

  const rope = new Rope(HOOK, HOOK.clone().add(new THREE.Vector3(0, -15, 0)), 17, 22)
  rope.endWeight = 4
  group.add(rope.dots.points)
  const sparks = new Sparks()
  group.add(sparks.dots.points)

  const s = stage(host, (s) => {
    const narrow = s.width < 640
    group.position.set(narrow ? -5 : -4, 2, 0)
    const ppu = fit(s, narrow ? 40 : 56, 40, 0.98)
    plugDots.size(ppu * 0.24, s)
    fixed.size(ppu * 0.24, s)
    rope.dots.size(ppu * 0.3, s)
    sparks.dots.size(ppu * 0.5, s)
  })
  s.scene.add(group)
  load(plugDots, shape.pts, s)
  load(fixed, [...socket.pts, ...hookPts], s)
  rope.paint(ink(s))

  const say = caption(host)
  say('❯ grab it · throw it in')

  let state: 'free' | 'held' | 'toss' | 'plugged' = 'free'
  let angle = -Math.PI / 2 // the plug's heading; hanging, it points down
  const at = new THREE.Vector3()
  const hold = new THREE.Vector3() // where the pointer holds it
  const heldVel = new THREE.Vector3()
  let down: { x: number; y: number; moved: number } | null = null

  const connect = () => {
    state = 'plugged'
    angle = 0
    tones(plugDots, shape.led, shape.leds, 1)
    tones(fixed, socket.ring, socket.rings, 1)
    sparks.burst(SX, 0, 90)
    say('✓ plugin loaded')
  }
  // Throws the cable: verlet keeps velocity in the previous positions, so
  // give each node a share of `v`, growing towards the plug.
  const fling = (v: THREE.Vector3) => {
    const last = rope.nodes.length - 1
    rope.nodes.forEach((p, i) => rope.prev[i].copy(p).addScaledVector(v, -i / last / 60))
  }
  // A tap: the plug flies along an arc into the socket.
  const tossFrom = new THREE.Vector3()
  let tossAt = 0
  let clock = 0
  const toss = () => {
    state = 'toss'
    tossFrom.copy(at)
    tossAt = clock
  }
  let releasedAt = -10 // the swing back must not plug it straight in again
  const release = () => {
    state = 'free'
    releasedAt = clock
    tones(plugDots, shape.led, shape.leds, 0.25)
    tones(fixed, socket.ring, socket.rings, 0.18)
    fling(new THREE.Vector3(-26, 18, 0))
    say('❯ grab it · throw it in')
  }

  host.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, moved: 0 }
    host.setPointerCapture(e.pointerId)
    if (state === 'free' && !reduced) {
      const m = s.hit(group)
      if (m && m.distanceTo(at) < 9) {
        state = 'held'
        hold.copy(m)
      }
    }
  })
  host.addEventListener('pointermove', (e) => {
    if (!down) return
    down.moved += Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y)
    down.x = e.clientX
    down.y = e.clientY
  })
  host.addEventListener('pointerup', () => {
    const tap = !down || down.moved < 6
    down = null
    if (state === 'plugged') return tap ? release() : undefined
    if (reduced) return connect()
    if (state === 'held' && !tap) {
      state = 'free'
      fling(heldVel.clone().multiplyScalar(1.3))
    } else if (tap && state !== 'toss') toss()
  })

  const redraw = run(s, (t, dt) => {
    clock = t
    group.rotation.y += (0.35 + (s.pointer.inside ? s.pointer.x : 0) * 0.1 - group.rotation.y) * 0.04

    if (state === 'held') {
      const m = s.pointer.inside ? s.hit(group) : null
      if (m) {
        const next = hold.clone().lerp(new THREE.Vector3(Math.min(m.x, SX - 3.2), THREE.MathUtils.clamp(m.y, -16, 16), 0), 0.5)
        if (dt > 0) heldVel.lerp(next.clone().sub(hold).divideScalar(dt), 0.4)
        hold.copy(next)
      }
      angle += (0 - angle) * 0.2 // held, it turns to face the socket
      at.copy(hold)
      rope.step(dt, new THREE.Vector3(-TAIL * Math.cos(angle), -TAIL * Math.sin(angle), 0).add(at))
      if (at.distanceTo(MOUTH) < 2.2) {
        at.copy(MOUTH)
        connect()
      }
    } else if (state === 'toss') {
      const k = Math.min(1, (t - tossAt) / 0.7)
      const e = k * k * (3 - 2 * k)
      const peak = tossFrom.clone().lerp(MOUTH, 0.5).add(new THREE.Vector3(0, 9, 0))
      const q = 1 - e
      at.copy(tossFrom).multiplyScalar(q * q).addScaledVector(peak, 2 * q * e).addScaledVector(MOUTH, e * e)
      angle += (0 - angle) * 0.15
      rope.step(dt, new THREE.Vector3(-TAIL * Math.cos(angle), -TAIL * Math.sin(angle), 0).add(at))
      if (k >= 1) connect()
    } else if (state === 'plugged') {
      at.set(SX, 0, 0)
      rope.step(dt, new THREE.Vector3(SX - TAIL, 0, 0))
    } else {
      // Swinging: the plug points along the cable's last stretch, away from the hook.
      rope.step(dt)
      const n = rope.nodes.length
      const dir = rope.end.clone().sub(rope.nodes[n - 3]).normalize()
      const heading = Math.atan2(dir.y, dir.x)
      angle += Math.atan2(Math.sin(heading - angle), Math.cos(heading - angle)) * 0.35
      at.copy(rope.end).add(new THREE.Vector3(Math.cos(angle) * TAIL, Math.sin(angle) * TAIL, 0))
      // The socket's block is solid: bounce off its face unless the prongs line up.
      const tip = at.clone().add(new THREE.Vector3(Math.cos(angle) * PRONG, Math.sin(angle) * PRONG, 0))
      if (t - releasedAt > 1.5 && Math.abs(tip.y) < 3 && tip.x > SX - 1 && Math.cos(angle) > 0.55) {
        at.copy(MOUTH)
        connect()
      } else if (tip.x > SX && Math.abs(tip.y) < 7) {
        const push = tip.x - SX
        rope.end.x -= push
        const prev = rope.prev[n - 1]
        prev.x = rope.end.x + (rope.end.x - prev.x) * 0.4
      }
    }
    plug.position.copy(at)
    plug.rotation.z = angle

    rope.draw()
    sparks.step(dt)
    const scan = scanY(t, 16, -16, 5)
    fixed.material.uniforms.uScan.value = scan
    plugDots.material.uniforms.uScan.value = scan - at.y
    host.style.cursor = state === 'held' ? 'grabbing' : state === 'plugged' ? 'pointer' : 'grab'
  })
  if (reduced) redraw()
}
