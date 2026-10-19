// The plugin demos: a scripted Claude Code session per plugin that plays the
// mod as it really behaves. The band of capsules shows up above the prompt, a
// pointer presses a button (now and then after selecting a line and typing a
// request in the prompt), the side pane opens with its loading line, the
// answer streams in, and the pane's own actions run (Artifact for
// how-why-teach, New session for handoff). Each demo loops while on screen,
// can be paused, and shows its final frame still under reduced motion.
import type { Button } from '../plugins'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const SPIN = ['◐', '◓', '◑', '◒']

interface Demo {
  root: HTMLElement
  log: HTMLElement
  band: HTMLElement
  input: HTMLElement
  pane: HTMLElement
  pointer: HTMLElement
  buttons: Button[]
  running: () => boolean
}

function el(tag: string, cls: string, text = '') {
  const e = document.createElement(tag)
  e.className = cls
  e.textContent = text
  return e
}

function capsule(label: string, color?: string) {
  const c = el('span', 'pill', label)
  if (color) c.style.setProperty('--c', color)
  return c
}

const TICK = 40 // ms between steps of the demo's clock

// Time that only passes while the demo runs: paused or off screen, it stands still.
async function wait(d: Demo, ms: number) {
  if (reduced) return
  for (let t = 0; t < ms; ) {
    await new Promise((r) => setTimeout(r, TICK))
    if (d.running()) t += TICK
  }
}

// Types `text` at `ms` per character; faster than a tick, several characters land per tick.
async function type(d: Demo, target: HTMLElement, text: string, ms: number) {
  const chars = [...text]
  const step = Math.max(1, Math.round(TICK / ms))
  for (let i = 0; i < chars.length; i += step) {
    target.textContent += chars.slice(i, i + step).join('')
    await wait(d, Math.max(ms, TICK))
  }
}

function line(d: Demo, text: string, cls = '') {
  const l = el('p', cls, text)
  d.log.append(l)
  return l
}

// The pointer glides to the middle of `target`, then presses it.
async function press(d: Demo, target: HTMLElement) {
  const box = d.pointer.parentElement!.getBoundingClientRect() // the window's body, under the title bar
  const r = target.getBoundingClientRect()
  d.pointer.classList.add('on')
  d.pointer.style.transform = `translate(${r.left - box.left + r.width / 2}px, ${r.top - box.top + r.height / 2}px)`
  await wait(d, 750)
  target.classList.add('pressed')
  await wait(d, 180)
  target.classList.remove('pressed')
}

// The pointer drags across `target`, highlighting it as a mouse selection does.
async function select(d: Demo, target: HTMLElement) {
  const box = d.pointer.parentElement!.getBoundingClientRect()
  const range = document.createRange()
  range.selectNodeContents(target)
  const r = range.getBoundingClientRect() // the text itself, not the whole line
  const y = r.top - box.top + r.height / 2
  d.pointer.classList.add('on')
  d.pointer.style.transform = `translate(${r.left - box.left}px, ${y}px)`
  await wait(d, 750)
  target.classList.add('sel')
  d.pointer.style.transform = `translate(${r.right - box.left}px, ${y}px)`
  await wait(d, 800)
}

async function prompt(d: Demo, text: string) {
  await wait(d, 400)
  await type(d, d.input, text, 12)
  await wait(d, 300)
  line(d, `❯ ${text}`, 'you')
  d.input.textContent = ''
}

// Types a request in the prompt, as the person does before pressing a button.
async function request(d: Demo, text: string) {
  await wait(d, 300)
  await type(d, d.input, text, 12)
  await wait(d, 400)
  return text
}

/** Opens the pane for `b`, spins its loading line, then streams the answer in. */
async function answer(d: Demo, b: Button, loading: string, seconds: number, selection?: string, request?: string) {
  d.pane.replaceChildren()
  const head = el('header', '')
  head.append(capsule(b.label, b.color), el('span', 'dim', b.subtitle))
  const body = el('div', 'body')
  const foot = el('footer', '')
  d.pane.append(
    head,
    ...(selection ? [el('p', 'dim', `About your selection: “${selection}”`)] : []),
    ...(request ? [el('p', 'dim', `Your request: “${request}”`)] : []),
    el('hr', ''),
    body,
    el('hr', ''),
    foot,
  )
  d.pane.classList.add('open')

  const spin = el('p', '', '')
  spin.style.color = b.color
  body.append(spin)
  for (let i = 0; i < (reduced ? 0 : 14); i++) {
    spin.textContent = `${SPIN[i % 4]} ${loading}`
    await wait(d, 110)
  }
  spin.remove()
  head.lastElementChild!.textContent = `${b.subtitle} · ${seconds}s`
  for (const text of (selection && b.selected) || b.answer) {
    const p = el('p', text.startsWith('## ') ? 'h' : '', '')
    if (text.startsWith('## ')) p.style.color = b.color
    body.append(p)
    await type(d, p, text.replace(/^## /, '') || ' ', 3)
    await wait(d, 40)
  }
  return { body, foot }
}

async function close(d: Demo, foot: HTMLElement) {
  await press(d, foot.lastElementChild as HTMLElement)
  d.pane.classList.remove('open')
  d.pointer.classList.remove('on')
  await wait(d, 900)
}

function reset(d: Demo, capsules: Button[]) {
  d.log.replaceChildren()
  d.band.replaceChildren()
  d.input.textContent = ''
  d.pane.classList.remove('open')
  d.band.classList.remove('on')
  const pills = capsules.map((b) => capsule(b.label, b.color))
  d.band.append(...pills, el('span', 'dim', '·'))
  return pills
}

async function howWhyTeach(d: Demo, round: number) {
  const pills = reset(d, d.buttons)
  await prompt(d, 'build a landing page for the plugins')
  await wait(d, 350)
  const write = line(d, '● Write(site/src/pages/index.astro)', 'tool')
  await wait(d, 300)
  line(d, '  └ Wrote 180 lines', 'dim')
  await wait(d, 400)
  line(d, '✻ Churned for 41s', 'clay')
  await wait(d, 500)
  d.band.classList.add('on')
  await wait(d, 700)

  // Every other round, select a line first: the answer is about that line alone.
  const k = round % d.buttons.length
  const selection = round % 2 === 1 ? write.textContent! : undefined
  // The band notes the selection, as the mod's badge does, until a press spends it.
  const badge = el('span', 'dim', `↳ “${selection?.slice(0, 24)}…” ✕`)
  // With it, a request typed in the prompt; the press takes it out of the prompt.
  let asked: string | undefined
  if (selection) {
    await select(d, write)
    pills.at(-1)!.after(badge)
    asked = await request(d, 'in one paragraph')
  }
  await press(d, pills[k])
  write.classList.remove('sel')
  badge.remove()
  d.input.textContent = ''
  const { body, foot } = await answer(d, d.buttons[k], 'Thinking…', 9, selection, asked)
  const actions = ['↻ Again', 'Copy', '◆ Artifact', '✕ Close'].map((t) => capsule(t))
  foot.append(...actions)
  await wait(d, 1200)

  // Every other round, publish the answer as an artifact.
  if (round % 2 === 0) {
    await press(d, actions[2])
    const status = el('p', 'status', '◆ Publishing the artifact…')
    status.style.color = d.buttons[k].color
    body.append(status)
    await wait(d, 1500)
    status.textContent = '◆ claude.ai/artifact/7f3c2e9a'
    actions[2].textContent = '↗ Open'
    await wait(d, 1600)
  }
  if (reduced) return
  await close(d, foot)
}

async function handoff(d: Demo) {
  const [pill] = reset(d, d.buttons)
  await prompt(d, 'wire the deploy workflow')
  await wait(d, 300)
  line(d, '● Bash(npm run build)', 'tool')
  line(d, '  └ 1 page built', 'dim')
  await wait(d, 350)
  line(d, '● Write(.github/workflows/site.yml)', 'tool')
  await wait(d, 350)
  line(d, '✻ Churned for 2m 03s', 'clay')
  line(d, '◔ 91% of context used', 'warn')
  await wait(d, 500)
  d.band.classList.add('on')
  await wait(d, 700)

  const asked = await request(d, 'focus on the deploy')
  await press(d, pill)
  d.input.textContent = ''
  const b = d.buttons[0]
  const { body, foot } = await answer(d, b, 'Writing the handoff…', 14, undefined, asked)
  const actions = ['↻ Again', 'Copy', '⇢ New session', '✕ Close'].map((t) => capsule(t))
  foot.append(...actions)
  await wait(d, 1200)

  await press(d, actions[2])
  const status = el('p', 'status', '⇢ Starting a background session…')
  status.style.color = b.color
  body.append(status)
  await wait(d, 1500)
  status.textContent = '⇢ Session 3f2a9c1e started in the background.'
  body.append(el('p', 'dim', 'Handoff file: /tmp/handoff-k2Xq.md'))
  actions[2].textContent = 'Copy attach'
  await wait(d, 2000)
  if (reduced) return
  await close(d, foot)
}

const SCRIPTS: Record<string, (d: Demo, round: number) => Promise<void>> = {
  'how-why-teach': howWhyTeach,
  handoff,
}

export function start(root: HTMLElement) {
  const script = SCRIPTS[root.dataset.demo ?? '']
  if (!script) return
  let visible = false
  let paused = false
  const d: Demo = {
    root,
    log: root.querySelector('[data-log]')!,
    band: root.querySelector('[data-band]')!,
    input: root.querySelector('[data-input]')!,
    pane: root.querySelector('[data-pane]')!,
    pointer: root.querySelector('[data-pointer]')!,
    buttons: JSON.parse(root.dataset.buttons ?? '[]'),
    running: () => visible && !paused,
  }
  new IntersectionObserver(([e]) => (visible = e.isIntersecting), { threshold: 0.25 }).observe(root)
  const toggle = root.querySelector<HTMLButtonElement>('[data-pause]')
  toggle?.addEventListener('click', () => {
    paused = !paused
    toggle.textContent = paused ? 'PLAY' : 'PAUSE'
  })
  if (reduced && toggle) toggle.hidden = true
  void (async () => {
    for (let round = 0; ; round++) {
      await script(d, round)
      if (reduced) return
    }
  })()
}
