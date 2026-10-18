// What the three header scenes share: a three.js stage that fits its host,
// the pointer, a render loop that runs only while on screen, and a points
// material that draws round terminal dots with a CRT scan line.
import * as THREE from 'three'

// The shaders write the CSS hex colours as they are, with no linear round trip.
THREE.ColorManagement.enabled = false

export { THREE }
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

export interface Stage {
  host: HTMLElement
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  width: number
  height: number
  ratio: number
  /** Pointer in normalised device coordinates; `inside` is false once it leaves. */
  pointer: { x: number; y: number; inside: boolean }
  css(name: string): string
  /** Where the pointer's ray meets the plane z = 0 of `object`, in its local space. */
  hit(object: THREE.Object3D, x?: number, y?: number): THREE.Vector3 | null
}

export function stage(host: HTMLElement, onResize: (s: Stage) => void): Stage {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400)
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const inverse = new THREE.Matrix4()

  const s: Stage = {
    host,
    renderer,
    scene: new THREE.Scene(),
    camera,
    width: 1,
    height: 1,
    ratio: 1,
    pointer: { x: 0, y: 0, inside: false },
    css: (name) => getComputedStyle(host).getPropertyValue(name).trim(),
    hit(object, x = s.pointer.x, y = s.pointer.y) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
      object.updateMatrixWorld()
      const ray = raycaster.ray.clone().applyMatrix4(inverse.copy(object.matrixWorld).invert())
      return ray.intersectPlane(plane, new THREE.Vector3())
    },
  }

  const resize = () => {
    const { width, height } = host.getBoundingClientRect()
    s.width = Math.max(1, width)
    s.height = Math.max(1, height)
    s.ratio = Math.min(2, devicePixelRatio || 1)
    renderer.setPixelRatio(s.ratio)
    renderer.setSize(s.width, s.height, false)
    camera.aspect = s.width / s.height
    camera.updateProjectionMatrix()
    onResize(s)
  }
  new ResizeObserver(resize).observe(host)
  resize()

  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect()
    s.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1
    s.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1
    s.pointer.inside = true
  })
  host.addEventListener('pointerleave', () => {
    s.pointer.inside = false
  })
  return s
}

/** Moves the camera back until a `w` × `h` box at z = 0 fills `fill` of the stage; returns px per unit. */
export function fit(s: Stage, w: number, h: number, fill = 0.9) {
  const ppu = Math.min((s.width * fill) / w, (s.height * fill) / h)
  const tan = Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2))
  const z = s.height / (2 * tan * ppu)
  s.camera.position.set(0, 0, z)
  s.camera.near = z / 100
  s.camera.far = z * 4
  s.camera.updateProjectionMatrix()
  s.camera.lookAt(0, 0, 0)
  return ppu
}

/** Calls `frame` every animation frame while the stage is on screen; once, still, under reduced motion. */
export function run(s: Stage, frame: (t: number, dt: number) => void) {
  let running = false
  let id = 0
  let last = 0
  const draw = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    frame(reduced ? 0 : now / 1000, reduced ? 0 : dt)
    s.renderer.render(s.scene, s.camera)
  }
  const loop = (now: number) => {
    draw(now)
    id = requestAnimationFrame(loop)
  }
  new IntersectionObserver(([entry]) => {
    if (reduced) return draw(performance.now())
    if (entry.isIntersecting && !running) {
      running = true
      last = performance.now()
      id = requestAnimationFrame(loop)
    } else if (!entry.isIntersecting && running) {
      running = false
      cancelAnimationFrame(id)
    }
  }).observe(s.host)
  return () => draw(performance.now())
}

const vertex = /* glsl */ `
  uniform float uSize;
  uniform float uDist;
  uniform float uPx;
  uniform float uScan;
  attribute vec3 aColor;
  attribute float aTone;
  varying vec3 vColor;
  varying float vTone;

  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, uSize * uPx * uDist / -mv.z);
    // A CRT scan line: a band of brighter dots sweeping down.
    float scan = exp(-pow((position.y - uScan) / 1.2, 2.0));
    vTone = clamp(aTone + scan * 0.55 * step(0.01, aTone), 0.0, 1.0);
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

export interface Dots {
  points: THREE.Points
  position: THREE.BufferAttribute
  color: THREE.BufferAttribute
  tone: THREE.BufferAttribute
  material: THREE.ShaderMaterial
  /** Sets the dot size in css px at the camera's distance. */
  size(px: number, s: Stage): void
  /** Marks every attribute for upload. */
  flush(): void
}

export function dots(count: number): Dots {
  const geometry = new THREE.BufferGeometry()
  const attr = (n: number) => new THREE.BufferAttribute(new Float32Array(count * n), n).setUsage(THREE.DynamicDrawUsage)
  const position = attr(3)
  const color = attr(3)
  const tone = attr(1)
  geometry.setAttribute('position', position)
  geometry.setAttribute('aColor', color)
  geometry.setAttribute('aTone', tone)
  const material = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 4 }, uDist: { value: 1 }, uPx: { value: 1 }, uScan: { value: 1e4 } },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return {
    points,
    position,
    color,
    tone,
    material,
    size(px, s) {
      material.uniforms.uSize.value = px
      material.uniforms.uDist.value = s.camera.position.z
      material.uniforms.uPx.value = s.ratio
    },
    flush() {
      position.needsUpdate = true
      color.needsUpdate = true
      tone.needsUpdate = true
    },
  }
}

/** The scan line's y for time `t`: a sweep from `top` to `bottom` every `period` seconds, then a rest. */
export function scanY(t: number, top: number, bottom: number, period = 5) {
  const k = (t % period) / (period * 0.6)
  return k > 1 ? 1e4 : top + (bottom - top) * k
}

/** The page's ink colour. */
export function ink(s: Stage) {
  return new THREE.Color(s.css('--ink') || '#141413')
}
