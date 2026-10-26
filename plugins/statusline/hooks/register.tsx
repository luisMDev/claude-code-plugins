import { atom, read, update } from 'claude-code'
import type {
  ElementConstructor,
  EngineInterface,
  LinkProps,
  Register,
  RenderElement,
  SessionUsage,
  TextProps,
} from 'claude-code'

import type { Limit, Line } from '../types'
import { readPr, readRepo } from './repo'

const line = atom({ plugin: 'statusline', key: 'line' } as const, null)
const turn = atom({ plugin: 'statusline', key: 'turn' } as const, 0)

// Each tick turns the usage capsule to its other window and reads the repo
// again, so a commit or checkout made outside the session shows within it.
const TICK_MS = 10_000
// gh asks GitHub, so the PR is read again only on a new branch or past PR_MS.
const PR_MS = 5 * 60_000

// Gruvbox, as the other plugins' capsules: the pill colours and the old
// script's 256-colour palette.
const PILL_BG = '#504945'
const DIR_BG = '#3c3836'
const PILL_FG = '#ebdbb2'
const C = {
  model: '#ffaf00',
  dir: '#87afaf',
  faint: '#928374',
  worktree: '#afaf00',
  branch: '#d787af',
  ok: '#afaf00',
  up: '#87af87',
  down: '#ff8700',
  mod: '#ffaf00',
  bad: '#d75f5f',
  empty: '#7c6f64',
}
const EFFORT: Record<string, [segments: number, color: string]> = {
  low: [1, '#87af87'],
  medium: [2, '#afaf00'],
  high: [3, '#ffaf00'],
  xhigh: [4, '#ff8700'],
  max: [5, '#d75f5f'],
}
const WINDOWS: Record<string, string> = { five_hour: '5h', seven_day: 'week' }

// $.session.model() answers the id: claude-opus-5-5[1m] reads Opus 5.5, an id of another shape as it is.
function modelName(id: string) {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:\b|$)/.exec(id)
  if (!match) return id
  const [, family = '', major, minor] = match
  return `${family.charAt(0).toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ''}`
}

const limitsOf = (usage: SessionUsage): Limit[] =>
  Object.keys(WINDOWS).flatMap(kind =>
    usage.rateLimits
      .filter(limit => limit.kind === kind)
      .map(({ percentUsed, resetsAt }) => ({ kind, percentUsed, ...(resetsAt ? { resetsAt } : {}) })),
  )

// The PR read last, and for which branch; module state, so a reload reads it again.
let prRead: { branch?: string; at: number } = { at: -Infinity }

/** Reads everything the line shows; gh only when `withPr` and the last read is stale. */
async function refresh($: EngineInterface, withPr: boolean, patch: Partial<Line> = {}) {
  const cwd = await $.session.cwd()
  const [repo, model, usage, ultracode, now] = await Promise.all([
    readRepo($, cwd),
    $.session.model(),
    $.session.usage(),
    $.settings.read({ key: 'ultracode' }),
    $.clock.now(),
  ])
  const isPrStale = withPr && (repo?.branch !== prRead.branch || now - prRead.at >= PR_MS)
  if (isPrStale) {
    prRead = { branch: repo?.branch, at: now }
  }
  const pr = repo && isPrStale ? await readPr($, cwd) : undefined
  // Rate limits arrive with the first response; until then the last session's stand.
  const limits = limitsOf(usage)
  if (limits.length > 0) {
    await $.store.set('limits', limits)
  }

  // What was just read wins; the effort comes from turn.step, the PR from the last gh read.
  await update($, line, old => ({
    model: modelName(model),
    effort: patch.effort ?? old?.effort,
    ultracode: ultracode === true,
    cwd,
    repo,
    pr: repo === null ? null : pr !== undefined ? pr : (old?.pr ?? null),
    context: { tokens: usage.context.tokens ?? 0, percent: usage.context.percent ?? 0 },
    limits: limits.length > 0 ? limits : (patch.limits ?? old?.limits ?? []),
  }))
}

/** "43m", "2h 41m", "3d 0h": how long until a window resets, rounded up. */
function until(ms: number) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`
}

const level = (used: number) => (used >= 80 ? C.bad : used >= 50 ? C.mod : C.ok)

/** The four capsules: model and effort, repo, the usage window `shown`, context. */
function capsules(
  Text: ElementConstructor<TextProps>,
  Link: ElementConstructor<LinkProps> | undefined,
  l: Line,
  shown: number,
  now: number,
  caps: boolean,
) {
  const run = (text: string, color?: string, isBold = false) => (
    <Text color={color} weight={isBold ? 'bold' : undefined}>
      {text}
    </Text>
  )
  const bar = (filled: number, total: number, color: string) => [
    ...(filled > 0 ? [run('━'.repeat(filled), color)] : []),
    ...(filled < total ? [run('─'.repeat(total - filled), C.empty)] : []),
  ]
  // Ten segments filled to `used` %, half a segment and up filling one.
  const gauge = (used: number) => bar(Math.floor((Math.min(Math.max(used, 0), 100) + 5) / 10), 10, level(used))
  // Rounded caps (Nerd Font) only on the terminal; other surfaces have no such font.
  const capsule = (bg: string, groups: RenderElement[][]) => {
    const body = (
      <Text backgroundColor={bg} color={PILL_FG}>
        {' '}
        {groups.filter(g => g.length > 0).flatMap((g, i) => (i === 0 ? g : [' ', ...g]))}{' '}
      </Text>
    )
    return caps ? [<Text color={bg}>{''}</Text>, body, <Text color={bg}>{''}</Text>] : [body]
  }
  // One group per item, so each is spaced from the next.
  const each = (parts: RenderElement[]) => parts.map(part => [part])

  const [segments, effortColor] = EFFORT[l.effort ?? ''] ?? [0, C.faint]
  const model = capsule(PILL_BG, [
    [run(l.model, C.model, true)],
    segments > 0 ? bar(segments, 5, effortColor) : [],
    l.ultracode ? [run('✦ ultracode', C.branch, true)] : [],
  ])

  const r = l.repo
  const pr = l.pr
  const repo = capsule(
    DIR_BG,
    r === null
      ? [[run(l.cwd, C.dir)]]
      : [
          r.worktree
            ? [run(r.name, C.dir), run(` ↳ wt:${r.worktree}`, C.worktree, true)]
            : [run(`⌂ ${r.name}`, C.dir)],
          r.sub ? [run(r.sub, C.faint)] : [],
          [run(`⎇ ${r.branch}`, C.branch)],
          ...(r.sync === undefined
            ? [[run('no upstream', C.empty)]]
            : each([
                ...(r.sync.ahead > 0 ? [run(`↑${r.sync.ahead}`, C.up)] : []),
                ...(r.sync.behind > 0 ? [run(`↓${r.sync.behind}`, C.down)] : []),
              ])),
          ...(r.changes.staged + r.changes.modified + r.changes.untracked === 0
            ? [[run('✓', C.ok)]]
            : each([
                ...(r.changes.staged > 0 ? [run(`+${r.changes.staged}`, C.ok)] : []),
                ...(r.changes.modified > 0 ? [run(`~${r.changes.modified}`, C.mod)] : []),
                ...(r.changes.untracked > 0 ? [run(`?${r.changes.untracked}`, C.faint)] : []),
              ])),
          pr === null
            ? []
            : [
                Link ? <Link href={pr.url} label={`PR #${pr.number}`} /> : run(`PR #${pr.number}`, PILL_FG, true),
                ...(pr.review === 'approved' ? [run(' ✓', C.ok)] : []),
                ...(pr.review === 'changes_requested' ? [run(' ✗', C.bad)] : []),
                ...(pr.isDraft ? [run(' draft', C.faint)] : []),
              ],
        ],
  )

  const limit = l.limits.length > 0 ? l.limits[shown % l.limits.length] : undefined
  const resetsIn = limit?.resetsAt === undefined ? undefined : Date.parse(limit.resetsAt) - now
  const used = limit === undefined || (resetsIn !== undefined && resetsIn <= 0) ? 0 : limit.percentUsed
  const usage =
    limit === undefined
      ? []
      : capsule(PILL_BG, [
          [run(WINDOWS[limit.kind] ?? limit.kind, C.faint)],
          gauge(used),
          [run(`${Math.round(used)}%`, level(used))],
          resetsIn !== undefined && resetsIn > 0 ? [run(`· ${until(resetsIn)}`, C.faint)] : [],
        ])

  const context = capsule(usage.length > 0 ? DIR_BG : PILL_BG, [
    [run(`${Math.round(l.context.tokens / 1000)}k`)],
    gauge(l.context.percent),
    [run(`(${100 - l.context.percent}%)`, level(l.context.percent))],
  ])

  return [model, repo, usage, context].filter(c => c.length > 0).flatMap((c, i) => (i === 0 ? c : [' ', ...c]))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const [effort, saved] = await Promise.all([$.settings.read({ key: 'effortLevel' }), $.store.get('limits')])
    await refresh($, false, {
      ...(typeof effort === 'string' ? { effort } : {}),
      ...(Array.isArray(saved) ? { limits: saved as Limit[] } : {}),
    })
    const tick = () => {
      void update($, turn, n => n + 1)
      void refresh($, true)
    }
    $.clock.after(0, () => void refresh($, true))
    $.clock.every(TICK_MS, tick)
    return next(e)
  })

  // After each turn: the context, the limits and what the turn did to the repo.
  on('session.measure', async ($, e, next) => {
    await refresh($, false)
    return next(e)
  })

  // The effort each request of the main loop is sent with, /effort changes included.
  on('turn.step', async function* ($, e, next) {
    const effort = e.effort
    if (e.agentId === undefined && typeof effort === 'string') {
      await update($, line, l => (l === null || l.effort === effort ? l : { ...l, effort }))
    }
    return yield* next(e)
  })

  // Bottom right of the prompt footer: the engine's mode labels, then the capsules.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const l = await read($, line)
    if (l === null) {
      return next(e)
    }
    const labels = e.props.modes.length > 0 ? await next(e) : null
    const [shown, now] = await Promise.all([read($, turn), $.clock.now()])
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Link = 'Link' in elements ? elements.Link : undefined

    return (
      <Box flexDirection="row">
        {labels}
        {labels ? <Text dimColor> · </Text> : null}
        {capsules(Text, Link, l, shown, now, e.surface === 'terminal')}
      </Box>
    )
  })
}
