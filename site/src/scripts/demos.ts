// The plugin demos: a scripted Claude Code session per plugin that plays the
// mod as it really behaves. The band of capsules shows up above the prompt, a
// pointer presses a button (now and then after selecting a line and typing a
// request in the prompt), the side pane opens with its loading line, the
// answer streams in, and the pane's own actions run (Artifact for
// how-why-teach, New session for handoff). The statusline demo has no band:
// its status line under the prompt follows the session's branch, changes, PR,
// effort, usage and context. Each demo loops while on screen, can be paused,
// and shows its final frame still under reduced motion.
import type { Button } from '../plugins'

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const SPIN = ['◐', '◓', '◑', '◒']

interface Demo {
  root: HTMLElement
  log: HTMLElement
  band: HTMLElement
  status: HTMLElement
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
async function answer(
  d: Demo,
  b: Button,
  loading: string,
  [seconds, tokens]: [number, number],
  selection?: string,
  request?: string,
) {
  d.pane.replaceChildren()
  const head = el('header', '')
  const meta = el('span', 'dim meta') // seconds and tokens, at the right as in the mod's pane
  head.append(capsule(b.label, b.color), el('span', 'dim', b.subtitle), meta)
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

  // The loading line counts the seconds, as the mod's pane does, sped up.
  const spin = el('p', '', '')
  spin.style.color = b.color
  body.append(spin)
  const steps = reduced ? 0 : 14
  for (let i = 0; i < steps; i++) {
    spin.textContent = `${SPIN[i % 4]} ${loading} ${Math.floor((i * seconds) / steps)}s`
    await wait(d, 110)
  }
  spin.remove()
  meta.textContent = `${seconds}s · ${tokens < 1000 ? tokens : `${(tokens / 1000).toFixed(1)}k`} tokens`
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
  d.status.replaceChildren()
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
  const { body, foot } = await answer(d, d.buttons[k], 'Thinking…', [9, 640], selection, asked)
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
  const { body, foot } = await answer(d, b, 'Writing the handoff…', [14, 1120], undefined, asked)
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

// The 256-colour palette of plugins/statusline/statusline.sh, and its effort
// bar's colour from low to max.
const C = {
  model: '#ffaf00',
  dir: '#87afaf',
  branch: '#d787af',
  ok: '#afaf00',
  mod: '#ffaf00',
  bad: '#d75f5f',
  sep: '#6c6c6c',
}
const EFFORT = ['#87af87', '#afaf00', '#ffaf00', '#ff8700', '#d75f5f']

interface Status {
  effort: number // segments of the bar reached, 1 (low) to 5 (max)
  branch: string
  upstream: boolean
  changes: [staged: number, modified: number, untracked: number]
  pr?: { n: number; approved?: boolean }
  usage: [fiveHour: number, week: number] // used %
  turn: 0 | 1 // which usage window the capsule shows, as the script turns between them
  context: [tokens: number, left: number] // left: % of the window
}

function ink(text: string, color: string, dim = false) {
  const s = el('span', '', text)
  s.style.color = color
  if (dim) s.style.opacity = '0.6'
  return s
}

function cap(bg: string, ...parts: HTMLElement[]) {
  const c = el('span', 'pill')
  c.style.setProperty('--bg', bg)
  for (const [i, part] of parts.entries()) c.append(...(i ? [' ', part] : [part]))
  return c
}

const level = (used: number) => (used >= 80 ? C.bad : used >= 50 ? C.mod : C.ok)

// `filled` of `total` segments in `color`, the rest dim, as the script's segments().
function segments(filled: number, total: number, color: string) {
  const bar = el('span', '')
  for (let i = 0; i < total; i++) bar.append(i < filled ? ink('━', color) : ink('─', C.sep, true))
  return bar
}

// A 10-segment bar filled to `used` %, half a segment and up filling one, as the script's gauge().
const gauge = (used: number) => segments(Math.floor((used + 5) / 10), 10, level(used))

// Draws the four capsules as the script prints them; one whose text changed flashes.
function drawStatus(d: Demo, s: Status) {
  const before = [...d.status.children].map((c) => c.textContent)
  const model = el('b', '', 'Opus 5.5')
  model.style.color = C.model
  const bar = segments(s.effort, 5, EFFORT[s.effort - 1])

  const [staged, modified, untracked] = s.changes
  const changes = [
    ...(staged ? [ink(`+${staged}`, C.ok)] : []),
    ...(modified ? [ink(`~${modified}`, C.mod)] : []),
    ...(untracked ? [ink(`?${untracked}`, C.dir, true)] : []),
  ]
  const pr = s.pr ? [el('span', 'pr', `PR #${s.pr.n}`), ...(s.pr.approved ? [ink('✓', C.ok)] : [])] : []
  const [label, used, resets] = s.turn === 0 ? ['5h', s.usage[0], '2h 41m'] : ['week', s.usage[1], '3d 4h']
  const [tokens, left] = s.context

  d.status.replaceChildren(
    cap('#504945', model, bar),
    cap(
      '#3c3836',
      ink('⌂ claude-code-plugins', C.dir),
      ink(`⎇ ${s.branch}`, C.branch),
      ...(s.upstream ? [] : [ink('no upstream', C.sep, true)]),
      ...(changes.length ? changes : [ink('✓', C.ok)]),
      ...pr,
    ),
    cap('#504945', ink(label, C.dir, true), gauge(used), ink(`${used}%`, level(used)), ink(`· ${resets}`, C.dir, true)),
    cap(
      '#3c3836',
      el('span', '', `${Math.round(tokens / 1000)}k`),
      gauge(100 - left),
      ink(`(${left}%)`, level(100 - left)),
    ),
  )
  for (const [i, c] of [...d.status.children].entries()) {
    if (before.length && c.textContent !== before[i]) {
      c.classList.add('flash')
      setTimeout(() => c.classList.remove('flash'), 700)
    }
  }
}

async function statusline(d: Demo) {
  reset(d, [])
  let s: Status = {
    effort: 3,
    branch: 'main',
    upstream: true,
    changes: [0, 0, 0],
    usage: [12, 41],
    turn: 0,
    context: [182_400, 81],
  }
  const show = (change: Partial<Status>) => drawStatus(d, (s = { ...s, ...change }))
  show({})

  await prompt(d, 'add a status line plugin')
  await wait(d, 350)
  line(d, '● Bash(git switch -c feat/statusline)', 'tool')
  line(d, "  └ Switched to a new branch 'feat/statusline'", 'dim')
  show({ branch: 'feat/statusline', upstream: false })
  await wait(d, 1100)
  line(d, '● Write(plugins/statusline/hooks/register.ts)', 'tool')
  line(d, '  └ Wrote 18 lines', 'dim')
  show({ changes: [0, 0, 1], turn: 1, context: [205_100, 79] })
  await wait(d, 1100)
  line(d, '● Edit(README.md)', 'tool')
  line(d, '  └ Added 6 lines', 'dim')
  show({ changes: [0, 1, 1], usage: [15, 41], context: [219_300, 78] })
  await wait(d, 1100)
  line(d, '● Bash(git add . && git commit -m "Add statusline")', 'tool')
  line(d, '  └ 2 files changed', 'dim')
  show({ changes: [0, 0, 0], turn: 0 })
  await wait(d, 1100)
  line(d, '● Bash(git push -u origin feat/statusline && gh pr create --fill)', 'tool')
  line(d, '  └ github.com/luisMDev/claude-code-plugins/pull/7', 'dim')
  show({ upstream: true, pr: { n: 7 }, usage: [18, 42], context: [231_800, 76] })
  await wait(d, 400)
  line(d, '✻ Churned for 1m 12s', 'clay')
  await wait(d, 1800)
  show({ pr: { n: 7, approved: true }, turn: 1 })
  await wait(d, 1400)

  await prompt(d, '/effort max')
  line(d, '  └ Set effort level to max', 'dim')
  show({ effort: 5, context: [244_000, 75] })
  await wait(d, 1600)
  show({ turn: 0 })
  await wait(d, 1600)
}

const SCRIPTS: Record<string, (d: Demo, round: number) => Promise<void>> = {
  'how-why-teach': howWhyTeach,
  handoff,
  statusline,
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
    status: root.querySelector('[data-status]')!,
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
