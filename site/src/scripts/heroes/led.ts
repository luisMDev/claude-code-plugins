// Header option "led": the marketplace's name as a matrix of LED dots in 3D.
// The dots fly in and assemble, scatter from the pointer like filings from a
// magnet and spring back, ripple out from a click, and a scan line sweeps them.
import { THREE, dots, fit, ink, reduced, run, sampleText, scanY, stage, type Stage } from './dots'

const NAME = 'claude-code-plugins'
const ACCENT_FROM = 'claude-code-'.length // "plugins" lights in the accent
const LAYERS = 2 // a dimmer copy behind gives the letters depth when they tilt

export async function mount(host: HTMLElement) {
  const group = new THREE.Group()
  let wide: boolean | null = null
  let built: Awaited<ReturnType<typeof build>> | null = null
  let start = performance.now() / 1000

  const s = stage(host, async (s) => {
    const nowWide = s.width >= 720
    if (nowWide !== wide) {
      wide = nowWide
      const next = await build(s, nowWide)
      if (built) group.remove(built.dots.points)
      built = next
      group.add(built.dots.points)
      start = performance.now() / 1000
    }
    if (built) built.dots.size(fit(s, built.cols + 10, built.rows + 8, 0.94) * 0.72, s)
  })
  s.scene.add(group)

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => built?.paint(s))

  host.addEventListener('click', () => {
    const m = s.hit(group)
    if (!built || !m || reduced) return
    built.shock(m.x, m.y)
  })

  run(s, (t, dt) => {
    if (!built) return
    group.rotation.y += ((s.pointer.inside ? s.pointer.x : 0) * 0.28 - group.rotation.y) * 0.05
    group.rotation.x += ((s.pointer.inside ? -s.pointer.y : 0) * 0.2 - group.rotation.x) * 0.05
    built.step(t - start, dt, s.pointer.inside ? s.hit(group) : null)
    built.dots.material.uniforms.uScan.value = scanY(t, built.rows / 2 + 3, -built.rows / 2 - 3, 4.5)
  })
}

async function build(s: Stage, wide: boolean) {
  const lines = wide ? [NAME] : ['claude-code', 'plugins']
  const { points, cols, rows } = await sampleText(lines, { px: 90, step: wide ? 6 : 7 })
  const n = points.length * LAYERS
  const d = dots(n)
  const home = new Float32Array(n * 3)
  const pos = d.position.array as Float32Array
  const vel = new Float32Array(n * 3)
  const delay = new Float32Array(n)
  const accent = new Uint8Array(n)

  points.forEach((p, i) => {
    const lit = wide ? Math.floor(p.col * NAME.length) >= ACCENT_FROM : p.line === 1
    for (let layer = 0; layer < LAYERS; layer++) {
      const k = i * LAYERS + layer
      home.set([p.x, p.y, -layer * 0.9], k * 3)
      accent[k] = lit ? 1 : 0
      d.tone.setX(k, layer === 0 ? 1 : 0.28)
      delay[k] = ((p.x + cols / 2) / cols) * 0.9 + Math.random() * 0.15
      if (reduced) pos.set(home.subarray(k * 3, k * 3 + 3), k * 3)
      else pos.set([p.x + (Math.random() - 0.5) * 120, p.y + (Math.random() - 0.5) * 60, -40 - Math.random() * 120], k * 3)
    }
  })

  const paint = (s: Stage) => {
    const a = new THREE.Color(s.css('--accent') || '#d97757')
    const b = ink(s)
    for (let k = 0; k < n; k++) d.color.setXYZ(k, ...((accent[k] ? a : b).toArray() as [number, number, number]))
    d.color.needsUpdate = true
  }
  paint(s)
  d.flush()

  const R = 7 // the pointer's reach, in dots
  return {
    dots: d,
    cols,
    rows,
    paint,
    shock(x: number, y: number) {
      for (let k = 0; k < n; k++) {
        const dx = pos[k * 3] - x
        const dy = pos[k * 3 + 1] - y
        const dist = Math.hypot(dx, dy) || 1
        const f = Math.max(0, 1 - dist / 28) * 140
        vel[k * 3] += (dx / dist) * f
        vel[k * 3 + 1] += (dy / dist) * f
        vel[k * 3 + 2] += f * 0.9
      }
    },
    step(t: number, dt: number, m: THREE.Vector3 | null) {
      if (dt === 0) return
      for (let k = 0; k < n; k++) {
        if (t < delay[k]) continue
        const i = k * 3
        const hz = home[i + 2] + Math.sin(t * 1.6 + home[i] * 0.12) * 0.35
        let ax = (home[i] - pos[i]) * 70
        let ay = (home[i + 1] - pos[i + 1]) * 70
        let az = (hz - pos[i + 2]) * 70
        if (m) {
          const dx = pos[i] - m.x
          const dy = pos[i + 1] - m.y
          const dist = Math.hypot(dx, dy)
          if (dist < R && dist > 0.001) {
            const f = (1 - dist / R) ** 2 * 1400
            ax += (dx / dist) * f
            ay += (dy / dist) * f
            az += f * 0.6
          }
        }
        const damp = Math.max(0, 1 - 9 * dt)
        vel[i] = (vel[i] + ax * dt) * damp
        vel[i + 1] = (vel[i + 1] + ay * dt) * damp
        vel[i + 2] = (vel[i + 2] + az * dt) * damp
        pos[i] += vel[i] * dt
        pos[i + 1] += vel[i + 1] * dt
        pos[i + 2] += vel[i + 2] * dt
      }
      d.position.needsUpdate = true
    },
  }
}
