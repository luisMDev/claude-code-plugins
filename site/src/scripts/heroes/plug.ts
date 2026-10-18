// Header option "plug": a voxel plug on a cable follows the pointer; bring it
// to the socket (or click) and it snaps in, sparks fly and the line under it
// types "✓ plugin loaded". Click again to pull it out.
import { THREE, dots, fit, ink, reduced, run, scanY, stage } from './dots'
import { Rope, Sparks, TAIL, caption, load, plugPoints, socketPoints, tones } from './kit'

const SOCKET_X = 14
const ANCHOR = new THREE.Vector3(-40, 17, 0) // where the cable comes from, off the top left

export function mount(host: HTMLElement) {
  const group = new THREE.Group()
  group.rotation.y = 0.42
  group.position.y = -1

  const plugShape = plugPoints()
  const plug = new THREE.Group()
  const plugDots = dots(plugShape.pts.length)
  plug.add(plugDots.points)
  group.add(plug)

  const socket = socketPoints(SOCKET_X)
  const socketDots = dots(socket.pts.length)
  group.add(socketDots.points)

  // Long enough to sag even with the plug in the socket.
  const rope = new Rope(ANCHOR, new THREE.Vector3(-12, -2, 0), ANCHOR.distanceTo(new THREE.Vector3(SOCKET_X - TAIL, 0, 0)) * 1.3)
  group.add(rope.dots.points)
  const sparks = new Sparks()
  group.add(sparks.dots.points)

  let idleX = -14
  const s = stage(host, (s) => {
    // Narrow screens zoom in on the plug and the socket; the cable runs off the edge.
    const narrow = s.width < 640
    idleX = narrow ? -6 : -14
    group.position.x = narrow ? -2 : 6
    const ppu = fit(s, narrow ? 40 : 66, 30, 0.98)
    plugDots.size(ppu * 0.24, s)
    socketDots.size(ppu * 0.24, s)
    rope.dots.size(ppu * 0.3, s)
    sparks.dots.size(ppu * 0.5, s)
  })
  s.scene.add(group)
  load(plugDots, plugShape.pts, s)
  load(socketDots, socket.pts, s)
  rope.paint(ink(s))

  const say = caption(host)
  say('❯ plug it in')

  let state: 'free' | 'plugged' = 'free'
  const at = new THREE.Vector3(-14, -2, 0)
  const vel = new THREE.Vector3()
  const socketEntry = new THREE.Vector3(SOCKET_X, 0, 0)
  let flying = false
  let releasedAt = -10 // the magnet rests a moment after a pull, or the plug would snap straight back

  const connect = () => {
    state = 'plugged'
    flying = false
    tones(plugDots, plugShape.led, plugShape.leds, 1)
    tones(socketDots, socket.ring, socket.rings, 1)
    sparks.burst(SOCKET_X, 0, 80)
    say('✓ plugin loaded')
  }
  const release = () => {
    state = 'free'
    releasedAt = performance.now() / 1000
    vel.set(-28, 6, 0)
    tones(plugDots, plugShape.led, plugShape.leds, 0.25)
    tones(socketDots, socket.ring, socket.rings, 0.18)
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
      vel.addScaledVector(target.clone().sub(at), (state === 'plugged' ? 220 : flying ? 150 : 60) * dt)
      vel.multiplyScalar(Math.max(0, 1 - 8 * dt))
      at.addScaledVector(vel, dt)
      // The magnet: close enough to the socket's mouth and it pulls in.
      if (state === 'free' && t - releasedAt > 0.8 && Math.hypot(at.x - (SOCKET_X - 3), at.y) < (flying ? 0.8 : 2.2)) {
        at.set(SOCKET_X - 3, 0, 0)
        connect()
      }
    }
    plug.position.copy(at)
    plug.rotation.z = state === 'plugged' ? 0 : THREE.MathUtils.clamp(-vel.y * 0.012, -0.5, 0.5)
    plug.rotation.y = state === 'plugged' ? 0 : THREE.MathUtils.clamp(vel.x * 0.004, -0.2, 0.2)

    rope.step(dt, new THREE.Vector3(-TAIL, 0, 0).applyEuler(plug.rotation).add(at))
    rope.draw()
    sparks.step(dt)

    const scan = scanY(t, 14, -14, 5)
    socketDots.material.uniforms.uScan.value = scan
    plugDots.material.uniforms.uScan.value = scan - at.y
  })
  if (reduced) redraw()
}
