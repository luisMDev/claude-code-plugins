// The header's backdrop: stars in the terminal palette that twinkle, dithered
// nebulae, a perspective grid rolling towards the camera and the odd shooting
// star. It sits behind the scene and drifts against the pointer for depth.
import { THREE, dots, type Dots, type Stage } from './dots'

const PALETTE: [string, number][] = [
  ['#8a8780', 0.62], // dim ink
  ['#87afaf', 0.12], // teal
  ['#ffaf00', 0.08], // amber
  ['#d97757', 0.1], // clay
  ['#d787af', 0.08], // pink
]
const STARS = 1500
const TWINKLE = 260
const METEORS = 3
const TRAIL = 16

function pick() {
  let r = Math.random()
  for (const [hex, w] of PALETTE) if ((r -= w) <= 0) return new THREE.Color(hex)
  return new THREE.Color(PALETTE[0][0])
}

function put(d: Dots, i: number, p: THREE.Vector3, c: THREE.Color, tone: number) {
  d.position.setXYZ(i, p.x, p.y, p.z)
  d.color.setXYZ(i, c.r, c.g, c.b)
  d.tone.setX(i, tone)
}

export function backdrop() {
  const group = new THREE.Group()

  const stars = dots(STARS)
  const base = new Float32Array(STARS)
  for (let i = 0; i < STARS; i++) {
    base[i] = 0.12 + Math.random() ** 2 * 0.6
    put(stars, i, new THREE.Vector3((Math.random() - 0.5) * 520, (Math.random() - 0.5) * 180, -60 - Math.random() * 160), pick(), base[i])
  }

  // Nebulae: a few soft clouds, dithered by a cheap noise so they read as texture.
  const clouds = [
    { at: new THREE.Vector3(-120, 30, -190), r: 70, color: '#87afaf' },
    { at: new THREE.Vector3(140, -10, -200), r: 80, color: '#d787af' },
    { at: new THREE.Vector3(10, 55, -210), r: 60, color: '#d97757' },
  ]
  const nebula: { p: THREE.Vector3; c: THREE.Color; tone: number }[] = []
  for (const cloud of clouds) {
    const c = new THREE.Color(cloud.color)
    for (let i = 0; i < 1400; i++) {
      const u = (Math.random() * 2 - 1) * cloud.r
      const v = (Math.random() * 2 - 1) * cloud.r * 0.55
      const fall = 1 - Math.hypot(u / cloud.r, v / (cloud.r * 0.55))
      const grain = Math.sin(u * 0.09 + Math.sin(v * 0.07) * 2) * Math.cos(v * 0.11 - u * 0.03)
      const density = fall * (0.55 + grain * 0.45)
      if (fall <= 0 || Math.random() > density) continue
      nebula.push({ p: cloud.at.clone().add(new THREE.Vector3(u, v, (Math.random() - 0.5) * 20)), c, tone: 0.08 + density * 0.22 })
    }
  }
  const neb = dots(nebula.length)
  nebula.forEach((n, i) => put(neb, i, n.p, n.c, n.tone))

  // The grid: a floor of dots below the scene, its lines every 4 units.
  const gx: number[] = []
  for (let x = -140; x <= 140; x += 4) gx.push(x)
  const gz: number[] = []
  for (let z = 12; z >= -190; z -= 4) gz.push(z)
  const grid = dots(gx.length * gz.length)
  const ink = new THREE.Color('#8a8780')
  const clay = new THREE.Color('#d97757')
  gz.forEach((z, j) =>
    gx.forEach((x, i) => {
      const k = j * gx.length + i
      const accentLine = i % 6 === 0
      put(grid, k, new THREE.Vector3(x, -24, z), accentLine ? clay : ink, 0)
    }),
  )

  const meteors = dots(METEORS * TRAIL)
  const amber = new THREE.Color('#ffaf00')
  for (let i = 0; i < METEORS * TRAIL; i++) put(meteors, i, new THREE.Vector3(), amber, 0)
  const flying = Array.from({ length: METEORS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }))
  let nextMeteor = 1.5

  for (const d of [stars, neb, grid, meteors]) {
    d.flush()
    group.add(d.points)
  }

  const twinklers = Array.from({ length: TWINKLE }, () => Math.floor(Math.random() * STARS))
  return {
    group,
    /** Still dots swirl in with the intro; moving ones (their hash would flicker) fade in. */
    morphing: [stars, neb],
    fading: [grid, meteors],
    /** Sizes in css px at the camera's distance; far dots shrink with depth. */
    size(ppu: number, s: Stage) {
      stars.size(ppu * 0.55, s)
      neb.size(ppu * 0.5, s)
      grid.size(ppu * 0.45, s)
      meteors.size(ppu * 0.6, s)
    },
    step(t: number, dt: number, px: number, py: number) {
      group.rotation.y += (-px * 0.05 - group.rotation.y) * 0.03
      group.rotation.x += (py * 0.03 - group.rotation.x) * 0.03

      for (const i of twinklers) stars.tone.setX(i, base[i] * (0.55 + 0.45 * Math.sin(t * (1.3 + (i % 7) * 0.4) + i)))
      stars.tone.needsUpdate = true

      // The grid rolls towards the camera; rows fade in from the far end and out near it.
      const roll = (t * 6) % 4
      gz.forEach((z0, j) => {
        const z = z0 + roll
        const far = THREE.MathUtils.clamp((z + 190) / 60, 0, 1)
        const near = THREE.MathUtils.clamp((12 - z) / 10, 0, 1)
        gx.forEach((x, i) => {
          const k = j * gx.length + i
          grid.position.setZ(k, z)
          const side = 1 - Math.min(1, Math.abs(x) / 140)
          grid.tone.setX(k, far * near * side * (i % 6 === 0 ? 0.5 : 0.22))
        })
      })
      grid.position.needsUpdate = grid.tone.needsUpdate = true

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
