// The header: a voxel plug on a cable that follows the pointer, and a target
// to plug it into (a planet, a brain or a hive mind), over a backdrop of
// coloured stars, nebulae and a rolling grid. Everything swirls in on load.
// The plug warms as it nears the port; plugging in shakes the scene, sends a
// shock ring out, runs data pulses down the cable and wakes the target; a dot
// screen above the target types the status. Click to plug in or pull out.
import { backdrop } from './backdrop'
import { THREE, dots, fit, ink, reduced, run, scanY, stage } from './dots'
import { Rope, Sparks, TAIL, accent, caption, load, plugPoints, tones } from './kit'
import { SX, TARGETS, type TargetKind } from './targets'

const ANCHOR = new THREE.Vector3(-44, 17, 0)
const SHOCK = 90
const INTRO = 2.2 // seconds for the swirl-in

export async function mount(host: HTMLElement, kind: TargetKind) {
  await document.fonts.load('700 26px "Geist Mono"')
  const group = new THREE.Group()
  group.rotation.y = 0.3

  const plugShape = plugPoints()
  const plug = new THREE.Group()
  const plugDots = dots(plugShape.pts.length)
  plug.add(plugDots.points)
  group.add(plug)

  const target = TARGETS[kind]()
  group.add(target.group)

  const rope = new Rope(ANCHOR, new THREE.Vector3(-12, -2, 0), ANCHOR.distanceTo(new THREE.Vector3(SX - TAIL, 0, 0)) * 1.3)
  group.add(rope.dots.points)
  const sparks = new Sparks(220)
  group.add(sparks.dots.points)

  // The shock ring: dots on a circle in the port's plane, racing outwards.
  const shock = dots(SHOCK)
  group.add(shock.points)
  let shockAt = -10

  // The status screen above the target: text drawn in a canvas, one dot per lit cell.
  const SCREEN = { w: 240, h: 64, step: 2, x: SX + 2, y: target.top + 4.2, width: 12 }
  const cols = SCREEN.w / SCREEN.step
  const rows = SCREEN.h / SCREEN.step
  const screen = dots(cols * rows)
  const cell = SCREEN.width / cols
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) screen.position.setXYZ(r * cols + c, SCREEN.x + c * cell, SCREEN.y - r * cell, 0)
  }
  group.add(screen.points)
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN.w
  canvas.height = SCREEN.h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  let screenText = ''
  let cursor = true
  const paintScreen = () => {
    ctx.clearRect(0, 0, SCREEN.w, SCREEN.h)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, SCREEN.w - 2, SCREEN.h - 2)
    ctx.font = '700 26px "Geist Mono"'
    ctx.fillStyle = '#fff'
    ctx.textBaseline = 'middle'
    ctx.fillText(screenText + (cursor ? '_' : ''), 14, SCREEN.h / 2 + 1)
    const data = ctx.getImageData(0, 0, SCREEN.w, SCREEN.h).data
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a = data[(r * SCREEN.step * SCREEN.w + c * SCREEN.step) * 4 + 3] / 255
        screen.tone.setX(r * cols + c, a > 0.3 ? a : 0)
      }
    }
    screen.tone.needsUpdate = true
  }

  const sky = backdrop()
  const morphing = [plugDots, screen, ...target.parts, ...sky.morphing]
  const fading = [rope.dots, sparks.dots, shock, ...sky.fading]

  let idleX = -14
  const s = stage(host, (s) => {
    const narrow = s.width < 640
    idleX = narrow ? -6 : -14
    group.position.set(narrow ? -10 : -6, -3, 0)
    const ppu = fit(s, narrow ? 56 : 84, 36, 0.98)
    plugDots.size(ppu * 0.24, s)
    for (const d of target.parts) d.size(ppu * 0.22, s)
    rope.dots.size(ppu * 0.3, s)
    sparks.dots.size(ppu * 0.5, s)
    shock.size(ppu * 0.4, s)
    screen.size(ppu * cell * 0.9, s)
    sky.size(ppu, s)
  })
  s.scene.add(sky.group, group)
  load(plugDots, plugShape.pts, s)
  const a = accent(s)
  const b = ink(s)
  rope.paint(b)
  for (let i = 0; i < SHOCK; i++) shock.color.setXYZ(i, a.r, a.g, a.b)
  for (let i = 0; i < cols * rows; i++) screen.color.setXYZ(i, a.r, a.g, a.b)
  screen.flush()

  // The status types on the screen; a hidden live region reads it out.
  const say = caption(host, true)
  let typing = 0
  const show = (text: string) => {
    say(text)
    const id = ++typing
    let i = reduced ? text.length : 0
    const tick = () => {
      if (id !== typing) return
      screenText = text.slice(0, i)
      paintScreen()
      if (i++ < text.length) setTimeout(tick, 45)
    }
    tick()
  }
  show('❯ waiting')
  setInterval(() => {
    cursor = !cursor
    paintScreen()
  }, 530)

  let state: 'free' | 'plugged' = 'free'
  const at = new THREE.Vector3(-14, -2, 0)
  const vel = new THREE.Vector3()
  const socketEntry = new THREE.Vector3(SX, 0, 0)
  let flying = false
  let releasedAt = -10 // the magnet rests a moment after a pull, or the plug would snap straight back
  let clock = 0
  let heat = 0
  let cableLit = false
  let introAt = -1

  const connect = () => {
    state = 'plugged'
    flying = false
    tones(plugDots, plugShape.led, plugShape.leds, 1)
    sparks.burst(SX, 0, 160, 1.4)
    shockAt = clock
    target.connect(clock)
    show('✓ loaded')
  }
  const release = () => {
    state = 'free'
    releasedAt = clock
    vel.set(-28, 6, 0)
    tones(plugDots, plugShape.led, plugShape.leds, 0.25)
    target.release(clock)
    show('❯ waiting')
  }
  host.addEventListener('click', () => {
    if (state === 'plugged') return release()
    if (reduced) {
      at.copy(socketEntry)
      return connect()
    }
    flying = true
  })

  const target3 = new THREE.Vector3()
  const warm = new THREE.Color()
  const redraw = run(s, (t, dt) => {
    clock = t
    if (introAt < 0) introAt = t
    const intro = reduced ? 1 : Math.min(1, (t - introAt) / INTRO)
    for (const d of morphing) d.material.uniforms.uIntro.value = intro
    for (const d of fading) d.material.uniforms.uFade.value = THREE.MathUtils.smoothstep(intro, 0.55, 1)

    const px = s.pointer.inside ? s.pointer.x : 0
    const py = s.pointer.inside ? s.pointer.y : 0
    group.rotation.y += (0.3 + px * 0.12 - group.rotation.y) * 0.05
    group.rotation.x += (-py * 0.08 - group.rotation.x) * 0.05
    sky.step(t, dt, px, py)
    target.step(t, dt)

    if (state === 'plugged') target3.copy(socketEntry)
    else if (flying) target3.set(SX - 3, 0, 0)
    else if (s.pointer.inside && intro >= 1) {
      const m = s.hit(group)
      if (m) target3.set(Math.min(m.x, SX - 3.2), THREE.MathUtils.clamp(m.y, -12, 12), 0)
    } else target3.set(idleX, -2 + Math.sin(t * 1.3) * 1.2, 0)

    if (dt > 0) {
      vel.addScaledVector(target3.clone().sub(at), (state === 'plugged' ? 220 : flying ? 150 : 60) * dt)
      vel.multiplyScalar(Math.max(0, 1 - 8 * dt))
      at.addScaledVector(vel, dt)
      if (state === 'free' && t - releasedAt > 0.8 && Math.hypot(at.x - (SX - 3), at.y) < (flying ? 0.8 : 2.2)) {
        at.set(SX - 3, 0, 0)
        connect()
      }
    }
    plug.position.copy(at)
    plug.rotation.z = state === 'plugged' ? 0 : THREE.MathUtils.clamp(-vel.y * 0.012, -0.5, 0.5)
    plug.rotation.y = state === 'plugged' ? 0 : THREE.MathUtils.clamp(vel.x * 0.004, -0.2, 0.2)

    // The plug warms towards the accent as it nears the port.
    const near = state === 'plugged' ? 0.35 : THREE.MathUtils.clamp(1 - Math.hypot(at.x - SX, at.y) / 18, 0, 1)
    if (Math.abs(near - heat) > 0.01) {
      heat = near
      warm.copy(b).lerp(a, heat * 0.85)
      for (let i = 0; i < plugShape.led; i++) plugDots.color.setXYZ(i, warm.r, warm.g, warm.b)
      plugDots.color.needsUpdate = true
    }

    // The scene shakes for a moment after the plug goes in.
    const since = t - shockAt
    const shake = since < 0.35 && !reduced ? (1 - since / 0.35) * 0.6 : 0
    group.position.y = -3 + (Math.random() - 0.5) * shake
    plug.position.x += (Math.random() - 0.5) * shake

    rope.step(dt, new THREE.Vector3(-TAIL, 0, 0).applyEuler(plug.rotation).add(at))
    // Data pulses run down the cable towards the plug while it is in.
    rope.draw((f) => {
      if (state !== 'plugged' || reduced) return 0.85
      const wave = Math.pow(Math.max(0, Math.sin((f * 9 - t * 2.4) * Math.PI)), 12)
      return 0.6 + wave * 0.4
    })
    if (state === 'plugged') {
      for (let i = 0; i < rope.dots.tone.count; i++) {
        const lit = rope.dots.tone.getX(i) > 0.75
        rope.dots.color.setXYZ(i, ...((lit ? a : b).toArray() as [number, number, number]))
      }
      rope.dots.color.needsUpdate = true
      cableLit = true
    } else if (cableLit) {
      rope.paint(b)
      cableLit = false
    }
    sparks.step(dt)

    for (let i = 0; i < SHOCK; i++) {
      const ang = (i / SHOCK) * Math.PI * 2
      const r = 3.6 + since * 26
      shock.position.setXYZ(i, SX - 0.3, Math.sin(ang) * r, Math.cos(ang) * r)
      shock.tone.setX(i, since < 0.7 ? 1 - since / 0.7 : 0)
    }
    shock.flush()

    const scan = scanY(t, 16, -16, 5)
    for (const d of target.parts) d.material.uniforms.uScan.value = scan
    plugDots.material.uniforms.uScan.value = scan - at.y
  })
  if (reduced) redraw()
}
