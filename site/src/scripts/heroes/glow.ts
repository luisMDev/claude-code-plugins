// Header option "glow": the plug, with more feedback. The plug warms to the
// accent as it nears the socket; plugging in shakes the scene, sends a shock
// ring out of the socket and keeps data pulses running down the cable; a dot
// screen on the socket types the status.
import { THREE, dots, fit, ink, reduced, run, scanY, stage } from './dots'
import { Rope, Sparks, TAIL, accent, caption, load, plugPoints, socketPoints, tones } from './kit'

const SOCKET_X = 14
const ANCHOR = new THREE.Vector3(-40, 17, 0)
const SCREEN = { w: 240, h: 64, step: 2, x: SOCKET_X - 2, y: 9.6, width: 12 } // the status screen above the socket
const SHOCK = 90

export async function mount(host: HTMLElement) {
  await document.fonts.load('700 26px "Geist Mono"')
  const group = new THREE.Group()
  group.rotation.y = 0.42

  const plugShape = plugPoints()
  const plug = new THREE.Group()
  const plugDots = dots(plugShape.pts.length)
  plug.add(plugDots.points)
  group.add(plug)

  const socket = socketPoints(SOCKET_X)
  const socketDots = dots(socket.pts.length)
  group.add(socketDots.points)

  const rope = new Rope(ANCHOR, new THREE.Vector3(-12, -2, 0), ANCHOR.distanceTo(new THREE.Vector3(SOCKET_X - TAIL, 0, 0)) * 1.3)
  group.add(rope.dots.points)
  const sparks = new Sparks(220)
  group.add(sparks.dots.points)

  // The shock ring: dots on a circle in the socket's face plane, racing outwards.
  const shock = dots(SHOCK)
  group.add(shock.points)
  let shockAt = -10

  // The screen: text drawn in a canvas, one dot per lit cell, on the socket's front.
  const cols = SCREEN.w / SCREEN.step
  const rows = SCREEN.h / SCREEN.step
  const screen = dots(cols * rows)
  const k = SCREEN.width / cols
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) screen.position.setXYZ(r * cols + c, SCREEN.x + c * k, SCREEN.y - r * k, 6.6)
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

  let idleX = -14
  const s = stage(host, (s) => {
    const narrow = s.width < 640
    idleX = narrow ? -6 : -14
    group.position.set(narrow ? -3 : 5, -2, 0)
    const ppu = fit(s, narrow ? 42 : 66, 32, 0.98)
    plugDots.size(ppu * 0.24, s)
    socketDots.size(ppu * 0.24, s)
    rope.dots.size(ppu * 0.3, s)
    sparks.dots.size(ppu * 0.5, s)
    shock.size(ppu * 0.4, s)
    screen.size(ppu * k * 0.9, s)
  })
  s.scene.add(group)
  load(plugDots, plugShape.pts, s)
  load(socketDots, socket.pts, s)
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
  const socketEntry = new THREE.Vector3(SOCKET_X, 0, 0)
  let flying = false
  let releasedAt = -10 // the magnet rests a moment after a pull, or the plug would snap straight back
  let clock = 0
  let heat = 0
  let cableLit = false

  const connect = () => {
    state = 'plugged'
    flying = false
    tones(plugDots, plugShape.led, plugShape.leds, 1)
    tones(socketDots, socket.ring, socket.rings, 1)
    sparks.burst(SOCKET_X, 0, 160, 1.4)
    shockAt = clock
    show('✓ loaded')
  }
  const release = () => {
    state = 'free'
    releasedAt = performance.now() / 1000
    vel.set(-28, 6, 0)
    tones(plugDots, plugShape.led, plugShape.leds, 0.25)
    tones(socketDots, socket.ring, socket.rings, 0.18)
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

  const target = new THREE.Vector3()
  const warm = new THREE.Color()
  const redraw = run(s, (t, dt) => {
    clock = t
    group.rotation.y += (0.42 + (s.pointer.inside ? s.pointer.x : 0) * 0.12 - group.rotation.y) * 0.05
    group.rotation.x += ((s.pointer.inside ? -s.pointer.y : 0) * 0.08 - group.rotation.x) * 0.05

    if (state === 'plugged') target.copy(socketEntry)
    else if (flying) target.set(SOCKET_X - 3, 0, 0)
    else if (s.pointer.inside) {
      const m = s.hit(group)
      if (m) target.set(Math.min(m.x, SOCKET_X - 3.2), THREE.MathUtils.clamp(m.y, -12, 12), 0)
    } else target.set(idleX, -2 + Math.sin(t * 1.3) * 1.2, 0)

    if (dt > 0) {
      vel.addScaledVector(target.clone().sub(at), (state === 'plugged' ? 220 : flying ? 150 : 60) * dt)
      vel.multiplyScalar(Math.max(0, 1 - 8 * dt))
      at.addScaledVector(vel, dt)
      if (state === 'free' && t - releasedAt > 0.8 && Math.hypot(at.x - (SOCKET_X - 3), at.y) < (flying ? 0.8 : 2.2)) {
        at.set(SOCKET_X - 3, 0, 0)
        connect()
      }
    }
    plug.position.copy(at)
    plug.rotation.z = state === 'plugged' ? 0 : THREE.MathUtils.clamp(-vel.y * 0.012, -0.5, 0.5)
    plug.rotation.y = state === 'plugged' ? 0 : THREE.MathUtils.clamp(vel.x * 0.004, -0.2, 0.2)

    // The plug warms towards the accent as it nears the socket.
    const near = state === 'plugged' ? 0.35 : THREE.MathUtils.clamp(1 - Math.hypot(at.x - SOCKET_X, at.y) / 18, 0, 1)
    if (Math.abs(near - heat) > 0.01) {
      heat = near
      warm.copy(b).lerp(a, heat * 0.85)
      for (let i = 0; i < plugShape.led; i++) plugDots.color.setXYZ(i, warm.r, warm.g, warm.b)
      plugDots.color.needsUpdate = true
    }

    // The scene shakes for a moment after the plug goes in.
    const since = t - shockAt
    const shake = since < 0.35 && !reduced ? (1 - since / 0.35) * 0.6 : 0
    group.position.y = -2 + (Math.random() - 0.5) * shake
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
      shock.position.setXYZ(i, SOCKET_X - 0.3, Math.sin(ang) * r, Math.cos(ang) * r)
      shock.tone.setX(i, since < 0.7 ? 1 - since / 0.7 : 0)
    }
    shock.flush()

    const scan = scanY(t, 14, -14, 5)
    socketDots.material.uniforms.uScan.value = scan
    plugDots.material.uniforms.uScan.value = scan - at.y
  })
  if (reduced) redraw()
}
