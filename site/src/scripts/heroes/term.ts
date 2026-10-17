// Header option "term": a terminal window made of dots, tilted in 3D, that
// leans towards the pointer and bulges under it. A session loops inside it,
// and whatever you type lands in its prompt.
import { THREE, fit, reduced, run, scanY, stage, type Stage } from './dots'

const W = 640 // the window, in canvas px; one dot per STEP px
const H = 360
const STEP = 2
const COLS = W / STEP
const ROWS = H / STEP
const FONT = '17px "Geist Mono"'
const LINE = 27
const PILLS = ['#87afaf', '#ffaf00', '#afaf00', '#d787af', '#87d787']

const vertex = /* glsl */ `
  uniform float uSize;
  uniform float uDist;
  uniform float uPx;
  uniform float uScan;
  uniform float uTime;
  uniform vec3 uMouse;
  uniform vec3 uRipple;
  attribute vec3 aColor;
  attribute float aTone;
  varying vec3 vColor;
  varying float vTone;

  void main() {
    vec3 p = position;
    float d = distance(p.xy, uMouse.xy);
    p.z += uMouse.z * 14.0 * exp(-d * d / 900.0);       // the bulge under the pointer
    float age = uTime - uRipple.z;                        // a ripple from the last click
    float r = distance(p.xy, uRipple.xy) - age * 160.0;
    p.z += sin(r * 0.12) * 6.0 * exp(-r * r / 1600.0) * exp(-age * 1.8) * step(0.0, age);
    p.z += step(0.35, aTone) * 2.0;                       // lit dots stand proud of the glass
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uSize * uPx * uDist / -mv.z);
    float scan = exp(-pow((p.y - uScan) / 3.0, 2.0));
    vTone = clamp(aTone + scan * 0.45 * step(0.01, aTone), 0.0, 1.0);
    vColor = aColor;
  }
`

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vTone;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25 || vTone < 0.02) discard;
    gl_FragColor = vec4(vColor, vTone);
  }
`

interface Line {
  text: string
  color: string
}

export async function mount(host: HTMLElement) {
  await document.fonts.load(FONT)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  // One dot per lattice cell, centred, y up; tone and colour come from the canvas.
  const n = COLS * ROWS
  const geometry = new THREE.BufferGeometry()
  const position = new Float32Array(n * 3)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) position.set([c * STEP - W / 2, H / 2 - r * STEP, 0], (r * COLS + c) * 3)
  }
  const color = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage)
  const tone = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aColor', color)
  geometry.setAttribute('aTone', tone)
  const uniforms = {
    uSize: { value: 2 },
    uDist: { value: 1 },
    uPx: { value: 1 },
    uScan: { value: 1e4 },
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(0, 0, 0) },
    uRipple: { value: new THREE.Vector3(0, 0, -100) },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  const group = new THREE.Group()
  group.add(points)

  const s = stage(host, (s) => {
    const ppu = fit(s, W * 1.12, H * 1.2, 0.98)
    uniforms.uSize.value = ppu * STEP * 0.8
    uniforms.uDist.value = s.camera.position.z
    uniforms.uPx.value = s.ratio
  })
  s.scene.add(group)

  // The session's state, drawn into the canvas and sampled into the dots.
  const history: Line[] = []
  let input = ''
  let pills = 0
  let caret = true
  const palette = (s: Stage) => ({
    ink: s.css('--ink') || '#141413',
    dim: s.css('--muted') || '#73726b',
    accent: s.css('--accent') || '#d97757',
    ok: '#5fae6b',
  })

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
  }

  const draw = () => {
    const c = palette(s)
    ctx.clearRect(0, 0, W, H)
    ctx.lineWidth = 2
    ctx.strokeStyle = c.dim
    roundRect(1, 1, W - 2, H - 2, 14)
    ctx.stroke()
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((dot, i) => {
      ctx.fillStyle = dot
      ctx.beginPath()
      ctx.arc(22 + i * 20, 18, 6, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.font = '15px "Geist Mono"'
    ctx.fillStyle = c.dim
    ctx.textAlign = 'center'
    ctx.fillText('claude · ~/claude-code-plugins', W / 2, 23)
    ctx.textAlign = 'left'
    ctx.fillRect(0, 36, W, 2)

    ctx.font = FONT
    history.slice(-7).forEach((line, i) => {
      ctx.fillStyle = (c as Record<string, string>)[line.color] ?? c.ink
      ctx.fillText(line.text, 20, 66 + i * LINE)
    })

    // The band of buttons above the prompt: abstract pills, one per plugin.
    for (let i = 0; i < pills; i++) {
      ctx.fillStyle = PILLS[i % PILLS.length]
      roundRect(20 + i * 74, 270, 64, 22, 11)
      ctx.fill()
    }

    ctx.strokeStyle = c.dim
    roundRect(12, 302, W - 24, 42, 8)
    ctx.stroke()
    ctx.fillStyle = c.accent
    ctx.fillText('❯', 26, 330)
    ctx.fillStyle = c.ink
    ctx.fillText(input, 50, 330)
    if (caret) ctx.fillRect(50 + ctx.measureText(input).width + 2, 314, 11, 22)

    const data = ctx.getImageData(0, 0, W, H).data
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        const k = r * COLS + col
        const o = (r * STEP * W + col * STEP) * 4
        const a = data[o + 3] / 255
        // The glass: a sparse faint dot inside the window, so it reads as a pane.
        tone.setX(k, a > 0.15 ? a : r % 3 === 0 && col % 3 === 0 ? 0.16 : 0)
        color.setXYZ(k, a > 0.15 ? data[o] / 255 : 0.5, a > 0.15 ? data[o + 1] / 255 : 0.5, a > 0.15 ? data[o + 2] / 255 : 0.48)
      }
    }
    tone.needsUpdate = color.needsUpdate = true
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw)

  // The scripted session; a key from the visitor takes over the prompt.
  let typedByVisitor = false
  const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced ? 0 : ms))
  const type = async (text: string) => {
    for (const ch of text) {
      if (typedByVisitor) return false
      input += ch
      draw()
      await wait(38 + Math.random() * 40)
    }
    return true
  }
  const enter = (color = 'ink') => {
    history.push({ text: `❯ ${input}`, color })
    input = ''
    draw()
  }
  const say = async (text: string, color: string) => {
    await wait(450)
    history.push({ text, color })
    draw()
  }

  const session = async () => {
    for (;;) {
      history.length = 0
      pills = 0
      input = ''
      draw()
      await wait(700)
      if (!(await type('/plugin marketplace add luisMDev/claude-code-plugins'))) return
      enter()
      await say('  ✓ Added marketplace claude-code-plugins', 'ok')
      await wait(600)
      if (!(await type('/plugin install <plugin>@claude-code-plugins'))) return
      enter()
      await say('  ✓ Installed. Its buttons sit above your prompt.', 'ok')
      for (let i = 0; i < 4; i++) {
        await wait(380)
        if (typedByVisitor) return
        pills++
        draw()
      }
      await say('  Press one: it answers in a side pane.', 'dim')
      await wait(5200)
      if (typedByVisitor) return
    }
  }
  void session()

  let visible = false
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(host)
  addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement
    if (!visible || e.metaKey || e.ctrlKey || e.altKey || target.closest('input, textarea, [contenteditable]')) return
    if (!typedByVisitor && (e.key.length === 1 || e.key === 'Backspace')) {
      typedByVisitor = true
      input = ''
    }
    if (!typedByVisitor) return
    if (e.key === 'Backspace') input = input.slice(0, -1)
    else if (e.key === 'Enter' && input) {
      const asked = input
      enter()
      history.push({ text: '  ✻ Thinking…', color: 'dim' })
      history.push({
        text: asked.startsWith('/plugin') ? '  ✓ Paste that into Claude Code itself.' : '  This is a web page; install me for real.',
        color: asked.startsWith('/plugin') ? 'ok' : 'accent',
      })
    } else if (e.key.length === 1 && input.length < 46) input += e.key
    else return
    if (e.key === ' ') e.preventDefault()
    draw()
  })

  setInterval(() => {
    if (!visible) return
    caret = !caret
    draw()
  }, 530)

  host.addEventListener('click', () => {
    const m = s.hit(group)
    if (m) uniforms.uRipple.value.set(m.x, m.y, uniforms.uTime.value)
  })

  run(s, (t) => {
    uniforms.uTime.value = t
    const px = s.pointer.inside ? s.pointer.x : 0
    const py = s.pointer.inside ? s.pointer.y : 0
    group.rotation.y += (-0.32 + px * 0.25 - group.rotation.y) * 0.05
    group.rotation.x += (-0.16 - py * 0.18 - group.rotation.x) * 0.05
    group.position.y = Math.sin(t * 0.9) * 4
    const m = s.pointer.inside ? s.hit(group) : null
    const mouse = uniforms.uMouse.value
    if (m) mouse.set(mouse.x + (m.x - mouse.x) * 0.2, mouse.y + (m.y - mouse.y) * 0.2, Math.min(1, mouse.z + 0.06))
    else mouse.z = Math.max(0, mouse.z - 0.04)
    uniforms.uScan.value = scanY(t, H / 2, -H / 2, 6)
  })
}
