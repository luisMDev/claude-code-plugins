// The footer's field: stars and side-lit planets as points in 3D, each snapped
// to a screen grid so the scene reads as terminal dots, a voxel `❯_` drifting
// in front, and a meteor on every click. Loaded only when the footer nears view.
import * as THREE from 'three'

// The shaders write the CSS hex colours as they are, with no linear round trip.
THREE.ColorManagement.enabled = false

const GRID = 9 // css px between dot centres
const DEPTH = 140 // the field's length; points wrap around it
const SPEED = 2.2 // units per second the camera flies forward

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uGrid;
  uniform float uPx;
  uniform vec2 uRes;
  attribute vec3 aOffset;
  attribute float aTone;
  attribute float aAccent;
  attribute float aBlink;
  varying float vTone;
  varying float vAccent;

  void main() {
    // Each point travels with its cluster's centre, so planets wrap whole.
    // Still layers (the prompt, the meteors) keep their own z.
    vec3 centre = position;
    if (uSpeed > 0.0) centre.z = mod(centre.z + uTime * uSpeed, ${DEPTH.toFixed(1)}) - ${DEPTH.toFixed(1)};
    vec4 mv = modelViewMatrix * vec4(centre + aOffset, 1.0);
    vec4 clip = projectionMatrix * mv;

    // Snap to the dot grid in screen space.
    vec2 px = (clip.xy / clip.w * 0.5 + 0.5) * uRes;
    px = floor(px / uGrid) * uGrid + uGrid * 0.5;
    clip.xy = (px / uRes * 2.0 - 1.0) * clip.w;
    gl_Position = clip;

    float depth = -mv.z;
    gl_PointSize = uPx * mix(4.8, 2.7, smoothstep(8.0, 70.0, depth));
    float blink = aBlink > 0.5 ? step(0.5, fract(uTime * 0.9)) : 1.0;
    vTone = aTone * blink * (1.0 - smoothstep(90.0, ${DEPTH.toFixed(1)}, depth)) * smoothstep(1.0, 4.0, depth);
    vAccent = aAccent;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uInk;
  uniform vec3 uAccent;
  varying float vTone;
  varying float vAccent;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    if (dot(c, c) > 0.25 || vTone < 0.02) discard;
    gl_FragColor = vec4(mix(uInk, uAccent, vAccent), vTone);
  }
`

interface Cloud {
  centre: number[]
  offset: number[]
  tone: number[]
  accent: number[]
  blink: number[]
}

function cloud(): Cloud {
  return { centre: [], offset: [], tone: [], accent: [], blink: [] }
}

function push(c: Cloud, centre: number[], offset: number[], tone: number, accent = 0, blink = 0) {
  c.centre.push(...centre)
  c.offset.push(...offset)
  c.tone.push(tone)
  c.accent.push(accent)
  c.blink.push(blink)
}

function geometry(c: Cloud) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(c.centre, 3))
  g.setAttribute('aOffset', new THREE.Float32BufferAttribute(c.offset, 3))
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(c.tone, 1))
  g.setAttribute('aAccent', new THREE.Float32BufferAttribute(c.accent, 1))
  g.setAttribute('aBlink', new THREE.Float32BufferAttribute(c.blink, 1))
  return g
}

// Stars, and planets lit from one side: a dot survives where the light falls,
// thinning out towards the terminator, which draws a dithered crescent.
function field(): Cloud {
  const c = cloud()
  const rand = (a: number, b: number) => a + Math.random() * (b - a)
  for (let i = 0; i < 900; i++) {
    push(c, [rand(-60, 60), rand(-30, 30), rand(-DEPTH, 0)], [0, 0, 0], rand(0.25, 0.7))
  }
  const light = new THREE.Vector3(-0.8, 0.35, 0.5).normalize()
  for (let p = 0; p < 16; p++) {
    const centre = [rand(-38, 38), rand(-20, 20), rand(-DEPTH, 0)]
    const radius = rand(1.2, 4.5)
    const dots = Math.round(radius * radius * 70)
    for (let i = 0; i < dots; i++) {
      const n = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize()
      const lit = n.dot(light)
      if (lit < 0.05 || Math.random() > lit * 1.4) continue
      push(c, centre, [n.x * radius, n.y * radius, n.z * radius], 0.55 + lit * 0.45)
    }
  }
  return c
}

// `❯_` as voxels, three layers deep; the underscore blinks like a cursor.
const GLYPH = ['##.......', '.##......', '..##.....', '.##......', '##..#####']

function prompt(): Cloud {
  const c = cloud()
  const step = 0.42
  const w = GLYPH[0].length
  GLYPH.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      if (row[x] !== '#') continue
      for (let z = 0; z < 3; z++) {
        const offset = [(x - w / 2) * step, (GLYPH.length / 2 - y) * step, -z * step]
        push(c, [0, 0, 0], offset, 1 - z * 0.25, 1, x > 3 ? 1 : 0)
      }
    }
  })
  return c
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

const TRAIL = 16
const METEORS = 6

export function space(host: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, DEPTH + 20)

  const shared = {
    uTime: { value: 0 },
    uGrid: { value: GRID },
    uPx: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uInk: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
  }
  const material = (speed: number) =>
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uSpeed: { value: speed } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
    })

  scene.add(new THREE.Points(geometry(field()), material(SPEED)))

  // The prompt floats in front of the camera and follows it.
  const glyph = new THREE.Points(geometry(prompt()), material(0))
  glyph.position.set(0, 0, -14)
  glyph.frustumCulled = false
  scene.add(glyph)

  // Meteors: one buffer of trail dots, written on the CPU each frame.
  const meteors: Meteor[] = []
  const trail = cloud()
  for (let i = 0; i < METEORS * TRAIL; i++) push(trail, [0, 0, -20], [0, 0, 0], 0, 1)
  const trailGeometry = geometry(trail)
  const trailPoints = new THREE.Points(trailGeometry, material(0))
  trailPoints.frustumCulled = false
  scene.add(trailPoints)

  const colors = () => {
    const style = getComputedStyle(host)
    shared.uInk.value.set(style.getPropertyValue('--space-dot').trim() || '#8a8780')
    shared.uAccent.value.set(style.getPropertyValue('--accent').trim() || '#d97757')
  }
  colors()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    colors()
    draw(performance.now())
  })

  const resize = () => {
    const ratio = Math.min(2, devicePixelRatio || 1)
    const { width, height } = host.getBoundingClientRect()
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
    shared.uPx.value = ratio
    shared.uGrid.value = GRID * ratio
    shared.uRes.value.set(width * ratio, height * ratio)
  }
  new ResizeObserver(() => {
    resize()
    if (reduced || !running) draw(performance.now())
  }).observe(host)
  resize()

  const pointer = { x: 0, y: 0 }
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect()
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1
  })
  host.addEventListener('pointerleave', () => {
    pointer.x = pointer.y = 0
  })

  // A click sends a meteor across from the nearer side, aimed through the click.
  host.addEventListener('click', (e) => {
    if (reduced) return
    const r = host.getBoundingClientRect()
    const fromLeft = e.clientX - r.left > r.width / 2
    const at = new THREE.Vector3(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, 0.5)
      .unproject(camera)
      .sub(camera.position)
      .normalize()
    const hit = camera.position.clone().add(at.multiplyScalar(20 / -at.z))
    const angle = (0.35 + Math.random() * 0.4) * (fromLeft ? 1 : -1)
    const speed = 22 + Math.random() * 10
    const vx = (fromLeft ? 1 : -1) * Math.cos(angle) * speed
    const vy = -Math.abs(Math.sin(angle)) * speed
    if (meteors.length === METEORS) meteors.shift()
    meteors.push({ x: hit.x - vx * 0.8, y: hit.y - vy * 0.8, vx, vy, life: 2.2 })
  })

  let last = performance.now()
  const draw = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = reduced ? 0 : now / 1000
    shared.uTime.value = t

    camera.position.x += (pointer.x * 2.5 - camera.position.x) * 0.04
    camera.position.y += (-pointer.y * 1.5 - camera.position.y) * 0.04
    camera.lookAt(camera.position.x * 0.3, camera.position.y * 0.3, -60)

    glyph.position.x = camera.position.x
    glyph.position.y = camera.position.y + Math.sin(t * 0.8) * 0.3
    glyph.rotation.y = Math.sin(t * 0.5) * 0.45
    glyph.rotation.z = Math.sin(t * 0.37) * 0.06

    const offset = trailGeometry.getAttribute('aOffset') as THREE.BufferAttribute
    const tone = trailGeometry.getAttribute('aTone') as THREE.BufferAttribute
    tone.array.fill(0)
    for (let m = meteors.length - 1; m >= 0; m--) {
      const meteor = meteors[m]
      meteor.life -= dt
      meteor.x += meteor.vx * dt
      meteor.y += meteor.vy * dt
      if (meteor.life <= 0) {
        meteors.splice(m, 1)
        continue
      }
      for (let i = 0; i < TRAIL; i++) {
        const k = m * TRAIL + i
        offset.setXYZ(k, meteor.x - meteor.vx * i * 0.02, meteor.y - meteor.vy * i * 0.02, 0)
        tone.setX(k, (1 - i / TRAIL) * Math.min(1, meteor.life))
      }
    }
    offset.needsUpdate = true
    tone.needsUpdate = true

    renderer.render(scene, camera)
  }

  // Animate only while the footer is on screen.
  let running = false
  let frame = 0
  const loop = (now: number) => {
    draw(now)
    frame = requestAnimationFrame(loop)
  }
  new IntersectionObserver(([entry]) => {
    if (reduced) return draw(performance.now())
    if (entry.isIntersecting && !running) {
      running = true
      last = performance.now()
      frame = requestAnimationFrame(loop)
    } else if (!entry.isIntersecting && running) {
      running = false
      cancelAnimationFrame(frame)
    }
  }).observe(host)
}
