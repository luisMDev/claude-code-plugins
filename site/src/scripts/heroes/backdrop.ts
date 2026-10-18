// The header's backdrop, like the footer's: grey stars that twinkle and now
// and then a shooting star in the accent. It sits behind the scene and
// drifts against the pointer for depth.
import { THREE, dots, type Dots, type Stage } from './dots'

const STARS = 1500
const TWINKLE = 260
const METEORS = 3
const TRAIL = 16

function put(d: Dots, i: number, p: THREE.Vector3, c: THREE.Color, tone: number) {
  d.position.setXYZ(i, p.x, p.y, p.z)
  d.color.setXYZ(i, c.r, c.g, c.b)
  d.tone.setX(i, tone)
}

export function backdrop() {
  const group = new THREE.Group()
  const dim = new THREE.Color('#5e5d58')
  const grey = new THREE.Color('#8a8780')

  const stars = dots(STARS)
  const base = new Float32Array(STARS)
  for (let i = 0; i < STARS; i++) {
    base[i] = 0.12 + Math.random() ** 2 * 0.6
    const p = new THREE.Vector3((Math.random() - 0.5) * 520, (Math.random() - 0.5) * 180, -60 - Math.random() * 160)
    put(stars, i, p, Math.random() < 0.7 ? dim : grey, base[i])
  }

  const meteors = dots(METEORS * TRAIL)
  const clay = new THREE.Color('#d97757')
  for (let i = 0; i < METEORS * TRAIL; i++) put(meteors, i, new THREE.Vector3(), clay, 0)
  const flying = Array.from({ length: METEORS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }))
  let nextMeteor = 1.5

  for (const d of [stars, meteors]) {
    d.flush()
    group.add(d.points)
  }

  const twinklers = Array.from({ length: TWINKLE }, () => Math.floor(Math.random() * STARS))
  return {
    group,
    /** Still dots swirl in with the intro; moving ones (their hash would flicker) fade in. */
    morphing: [stars],
    fading: [meteors],
    /** Sizes in css px at the camera's distance; far dots shrink with depth. */
    size(ppu: number, s: Stage) {
      stars.size(ppu * 0.55, s)
      meteors.size(ppu * 0.6, s)
    },
    step(t: number, dt: number, px: number, py: number) {
      group.rotation.y += (-px * 0.05 - group.rotation.y) * 0.03
      group.rotation.x += (py * 0.03 - group.rotation.x) * 0.03

      for (const i of twinklers) stars.tone.setX(i, base[i] * (0.55 + 0.45 * Math.sin(t * (1.3 + (i % 7) * 0.4) + i)))
      stars.tone.needsUpdate = true

      // Now and then a shooting star crosses the back.
      nextMeteor -= dt
      if (nextMeteor <= 0) {
        nextMeteor = 2.5 + Math.random() * 4
        const m = flying.find((f) => f.life <= 0)
        if (m) {
          const left = Math.random() < 0.5
          m.p.set(left ? -200 : 200, 40 + Math.random() * 50, -140)
          m.v.set((left ? 1 : -1) * (120 + Math.random() * 60), -40 - Math.random() * 30, 0)
          m.life = 2
        }
      }
      flying.forEach((m, mi) => {
        if (m.life > 0) {
          m.life -= dt
          m.p.addScaledVector(m.v, dt)
        }
        for (let j = 0; j < TRAIL; j++) {
          const k = mi * TRAIL + j
          meteors.position.setXYZ(k, m.p.x - m.v.x * j * 0.012, m.p.y - m.v.y * j * 0.012, m.p.z)
          meteors.tone.setX(k, m.life > 0 ? (1 - j / TRAIL) * Math.min(1, m.life) * 0.9 : 0)
        }
      })
      meteors.position.needsUpdate = meteors.tone.needsUpdate = true
    },
  }
}
