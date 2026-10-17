// Header option "plug": a voxel plug on a cable follows the pointer; bring it
// to the socket (or click) and it snaps in, sparks fly and the line under it
// types "✓ plugin loaded". Click again to pull it out.
import { THREE, dots, fit, ink, reduced, run, scanY, stage, type Dots, type Stage } from './dots'

const SOCKET_X = 14 // the socket's face, in the scene's x
const PRONG = 2.6 // how far the prongs reach past the plug's face
const ANCHOR = new THREE.Vector3(-40, 17, 0) // where the cable comes from, off the top left
const NODES = 30
const SPARKS = 140

type Point = [x: number, y: number, z: number, tone: number, accent: number]

// Dots on the faces of a box, `gap` apart.
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, gap: number, tone: number) {
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

function fill(d: Dots, pts: Point[]) {
  pts.forEach(([x, y, z, tone], i) => {
    d.position.setXYZ(i, x, y, z)
    d.tone.setX(i, tone)
  })
  d.flush()
}

function paint(d: Dots, pts: Point[], s: Stage) {
  const a = new THREE.Color(s.css('--accent') || '#d97757')
  const b = ink(s)
  pts.forEach((p, i) => d.color.setXYZ(i, ...((p[4] ? a : b).toArray() as [number, number, number])))
  d.color.needsUpdate = true
}

// The plug, its face at x = 0 pointing +x: a body, two prongs, a status LED on top.
function plugPoints(): Point[] {
  return [
    ...box(-6, 0, -3, 3, -2.2, 2.2, 0.6, 0.75),
    ...box(-7.5, -6, -1.4, 1.4, -1.2, 1.2, 0.5, 0.6), // the strain relief where the cable enters
    ...box(0, PRONG, 0.9, 1.5, -0.3, 0.3, 0.55, 0.9),
    ...box(0, PRONG, -1.5, -0.9, -0.3, 0.3, 0.55, 0.9),
  ]
}

const LED: Point[] = [-3.6, -3, -2.4].flatMap((x) => [-0.5, 0.1].map((z): Point => [x, 3.4, z, 0.25, 1]))

// The socket: a block on the right with two slots on its face, a ring that
// lights when a plug is in, and a `❯` on the side facing the camera.
function socketPoints(): { body: Point[]; ring: Point[] } {
  const body = box(SOCKET_X, SOCKET_X + 4, -6, 6, -6, 6, 0.7, 0.55).filter(
    ([x, y, z]) => !(x === SOCKET_X && Math.abs(Math.abs(y) - 1.2) < 0.55 && Math.abs(z) < 0.5),
  )
  const glyph = ['##...', '.##..', '..##.', '.##..', '##...']
  glyph.forEach((row, r) =>
    [...row].forEach((c, col) => {
      if (c === '#') body.push([SOCKET_X + 0.9 + col * 0.55, 1.4 - r * 0.7, 6.4, 1, 1])
    }),
  )
  const ring: Point[] = []
  for (let a = 0; a < Math.PI * 2; a += 0.16) ring.push([SOCKET_X - 0.2, Math.sin(a) * 3.6, Math.cos(a) * 3.6, 0.18, 1])
  return { body, ring }
}

export function mount(host: HTMLElement) {
  const group = new THREE.Group()
  group.rotation.y = 0.42
  group.position.y = -1

  const plugPts = plugPoints()
  const plug = new THREE.Group()
  const plugDots = dots(plugPts.length + LED.length)
  fill(plugDots, [...plugPts, ...LED])
  plug.add(plugDots.points)
  group.add(plug)

  const { body, ring } = socketPoints()
  const socketDots = dots(body.length + ring.length)
  fill(socketDots, [...body, ...ring])
  group.add(socketDots.points)

  // The cable: a verlet rope, drawn as two strands of dots per segment.
  const rope = Array.from({ length: NODES }, (_, i) => ANCHOR.clone().lerp(new THREE.Vector3(-12, -2, 0), i / (NODES - 1)))
  const prev = rope.map((p) => p.clone())
  // Long enough to sag even with the plug in the socket.
  const SEG = (ANCHOR.distanceTo(new THREE.Vector3(SOCKET_X - 7.5, 0, 0)) * 1.3) / (NODES - 1)
  const PER = 3
  const cableDots = dots((NODES - 1) * PER * 2)
  group.add(cableDots.points)

  const sparks = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1 }))
  const sparkDots = dots(SPARKS)
  group.add(sparkDots.points)

  const all = [plugDots, socketDots, cableDots, sparkDots]
  let idleX = -14
  const s = stage(host, (s) => {
    // Narrow screens zoom in on the plug and the socket; the cable runs off the edge.
    const narrow = s.width < 640
    idleX = narrow ? -6 : -14
    group.position.x = narrow ? -2 : 6
    const ppu = fit(s, narrow ? 40 : 66, 30, 0.98)
    for (const d of all) d.size(ppu * 0.24, s)
    cableDots.size(ppu * 0.3, s)
    sparkDots.size(ppu * 0.5, s)
  })
  s.scene.add(group)

  const recolor = () => {
    paint(plugDots, [...plugPts, ...LED], s)
    paint(socketDots, [...body, ...ring], s)
    const b = ink(s)
    for (let i = 0; i < cableDots.color.count; i++) cableDots.color.setXYZ(i, b.r, b.g, b.b)
    cableDots.color.needsUpdate = true
  }
  recolor()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', recolor)

  const msg = document.createElement('p')
  msg.className = 'hero-msg'
  msg.setAttribute('aria-live', 'polite')
  host.appendChild(msg)
  let typing = 0
  const say = (text: string) => {
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
  say('❯ plug it in')

  let state: 'free' | 'plugged' = 'free'
  const at = new THREE.Vector3(-14, -2, 0)
  const vel = new THREE.Vector3()
  const socketEntry = new THREE.Vector3(SOCKET_X, 0, 0)
  let flying = false

  const connect = () => {
    state = 'plugged'
    flying = false
    for (let i = 0; i < LED.length; i++) plugDots.tone.setX(plugPts.length + i, 1)
    for (let i = 0; i < ring.length; i++) socketDots.tone.setX(body.length + i, 1)
    plugDots.tone.needsUpdate = socketDots.tone.needsUpdate = true
    for (let i = 0; i < 80; i++) {
      const spark = sparks[i]
      spark.p.set(SOCKET_X - 0.2, (Math.random() < 0.5 ? 1 : -1) * 1.2, 0)
      spark.v.set(-Math.random() * 18 - 4, Math.random() * 22 - 6, (Math.random() - 0.5) * 18)
      spark.max = spark.life = 0.5 + Math.random() * 0.7
    }
    say('✓ plugin loaded')
  }
  const release = () => {
    state = 'free'
    vel.set(-28, 6, 0)
    for (let i = 0; i < LED.length; i++) plugDots.tone.setX(plugPts.length + i, 0.25)
    for (let i = 0; i < ring.length; i++) socketDots.tone.setX(body.length + i, 0.18)
    plugDots.tone.needsUpdate = socketDots.tone.needsUpdate = true
    say('❯ plug it in')
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
  const redraw = run(s, (t, dt) => {
    group.rotation.y += (0.42 + (s.pointer.inside ? s.pointer.x : 0) * 0.12 - group.rotation.y) * 0.05
    group.rotation.x += ((s.pointer.inside ? -s.pointer.y : 0) * 0.08 - group.rotation.x) * 0.05

    // Where the plug wants to be: the socket, the pointer, or an idle bob.
    if (state === 'plugged') target.copy(socketEntry)
    else if (flying) target.set(SOCKET_X - 3, 0, 0)
    else if (s.pointer.inside) {
      const m = s.hit(group)
      if (m) target.set(Math.min(m.x, SOCKET_X - 3.2), THREE.MathUtils.clamp(m.y, -12, 12), 0)
    } else target.set(idleX, -2 + Math.sin(t * 1.3) * 1.2, 0)

    if (dt > 0) {
      vel.addScaledVector(target.clone().sub(at), (state === 'plugged' ? 220 : 60) * dt)
      vel.multiplyScalar(Math.max(0, 1 - 8 * dt))
      at.addScaledVector(vel, dt)
      // The magnet: close enough to the socket's mouth and it pulls in.
      if (state === 'free' && Math.hypot(at.x - (SOCKET_X - 3), at.y) < (flying ? 0.8 : 2.2)) {
        at.set(SOCKET_X - 3, 0, 0)
        connect()
      }
    }
    plug.position.copy(at)
    plug.rotation.z = state === 'plugged' ? 0 : THREE.MathUtils.clamp(-vel.y * 0.012, -0.5, 0.5)
    plug.rotation.y = state === 'plugged' ? 0 : THREE.MathUtils.clamp(vel.x * 0.004, -0.2, 0.2)

    // The rope: verlet with gravity, the ends pinned to the anchor and the plug's tail.
    const tail = new THREE.Vector3(-7.5, 0, 0).applyEuler(plug.rotation).add(at)
    if (dt > 0) {
      for (let i = 1; i < NODES - 1; i++) {
        const p = rope[i]
        const v = p.clone().sub(prev[i]).multiplyScalar(0.985)
        prev[i].copy(p)
        p.add(v).add(new THREE.Vector3(0, -60 * dt * dt, 0))
      }
    }
    rope[0].copy(ANCHOR)
    rope[NODES - 1].copy(tail)
    for (let pass = 0; pass < 14; pass++) {
      for (let i = 0; i < NODES - 1; i++) {
        const a = rope[i]
        const b = rope[i + 1]
        const delta = b.clone().sub(a)
        const len = delta.length() || 1
        const diff = (len - SEG) / len
        const pinA = i === 0
        const pinB = i + 1 === NODES - 1
        if (pinA && pinB) continue
        const k = pinA || pinB ? 1 : 0.5
        if (!pinA) a.addScaledVector(delta, diff * k)
        if (!pinB) b.addScaledVector(delta, -diff * k)
      }
    }
    let c = 0
    for (let i = 0; i < NODES - 1; i++) {
      for (let j = 0; j < PER; j++) {
        const p = rope[i].clone().lerp(rope[i + 1], j / PER)
        cableDots.position.setXYZ(c, p.x, p.y + 0.3, p.z)
        cableDots.tone.setX(c++, 0.85)
        cableDots.position.setXYZ(c, p.x, p.y - 0.3, p.z)
        cableDots.tone.setX(c++, 0.85)
      }
    }
    cableDots.position.needsUpdate = cableDots.tone.needsUpdate = true

    // Sparks fall and fade; alternate the accent and amber.
    sparks.forEach((spark, i) => {
      if (spark.life > 0) {
        spark.life -= dt
        spark.v.y -= 40 * dt
        spark.p.addScaledVector(spark.v, dt)
      }
      sparkDots.position.setXYZ(i, spark.p.x, spark.p.y, spark.p.z)
      sparkDots.tone.setX(i, Math.max(0, spark.life / spark.max))
      sparkDots.color.setXYZ(i, ...((i % 2 ? [1, 0.69, 0] : [0.85, 0.47, 0.34]) as [number, number, number]))
    })
    sparkDots.flush()

    const scan = scanY(t, 14, -14, 5)
    socketDots.material.uniforms.uScan.value = scan
    plugDots.material.uniforms.uScan.value = scan - at.y
  })
  if (reduced) redraw()
}
