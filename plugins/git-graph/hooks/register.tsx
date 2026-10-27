import { atom, read, update } from 'claude-code'
import type {
  BoxProps,
  ElementConstructor,
  EngineInterface,
  Register,
  RenderElement,
  SvgProps,
  TextProps,
  UiPressArgument,
} from 'claude-code'

import type { Graph, Ref, Row } from '../types'

import { PAGE, readGraph } from './git'
import { layout, lanesWidth, LANES, REF_COLOR, ROW, rowSvg } from './svg'

// The status line's capsule: rounded caps (Nerd Font) around a filled body.
// Only the terminal draws it: other surfaces have no Nerd Font and draw their
// own buttons, where a filled body would be a second button inside the first,
// so there the label is drawn alone, in its color.
const PILL_BG = '#504945'
const PILL_FG = '#ebdbb2'
const COLOR = '#83a598'

// While the pane is open it reads the repo again on this beat, so a commit or
// fetch made outside the session shows within it.
const TICK_MS = 15_000

export const PANE = 'git-graph'
const graph = atom({ plugin: 'git-graph', key: 'graph' } as const, null)

// Only the latest read writes; an older one that lands late is dropped.
let latest = 0
let isOpen = false

async function refresh($: EngineInterface, isAll?: boolean, limit?: number) {
  const run = ++latest
  const old = await read($, graph)
  const all = isAll ?? old?.isAll ?? true
  // Switching scope starts again from the first page.
  const count = limit ?? (isAll === undefined ? old?.limit : undefined) ?? PAGE
  await update($, graph, now => ({
    rows: [],
    local: [],
    remote: [],
    isBranchesOpen: false,
    picked: null,
    copied: null,
    at: 0,
    ...now,
    isAll: all,
    limit: count,
    status: 'loading' as const,
  }))

  let next: Partial<Graph>
  try {
    const got = await readGraph($, await $.session.cwd(), all, count)
    next =
      got === null
        ? { status: 'error', error: 'Not a git repository.', rows: [], local: [], remote: [] }
        : { status: 'done', ...got }
  } catch (error) {
    next = { status: 'error', error: String(error) }
  }
  const at = await $.clock.now()
  if (run === latest) {
    await update($, graph, now => (now === null ? now : { ...now, ...next, at }))
  }
}

async function open($: EngineInterface) {
  isOpen = true
  await $.ui.open({ id: PANE, title: 'Git Graph', closeOnEscape: true })
  // Each opening starts as at first: every branch, the lists folded, the first page.
  await update($, graph, now => (now === null ? now : { ...now, isBranchesOpen: false }))
  await refresh($, true, PAGE)
}

// Bands of several mods share one row of buttons above the engine's own band:
// the first mod drawn keys a column ('mod-band') whose first child is the row
// ('mod-buttons'); each mod above it puts its group at the row's start, a dot between.
const BAND_ROOT = 'mod-band'
const BAND_ROW = 'mod-buttons'

function joinBand(
  Box: ElementConstructor<BoxProps>,
  Text: ElementConstructor<TextProps>,
  mine: RenderElement,
  below: RenderElement,
) {
  const [row, ...rest] = below.type === 'Box' && below.props?.key === BAND_ROOT ? (below.children ?? []) : []
  if (typeof row === 'object' && row.type === 'Box' && row.props?.key === BAND_ROW) {
    return (
      <Box key={BAND_ROOT} flexDirection="column" paddingTop={1}>
        <Box key={BAND_ROW} columnGap={1} flexShrink={0}>
          {mine}
          <Text dimColor>·</Text>
          {row.children ?? []}
        </Box>
        {rest}
      </Box>
    )
  }

  return (
    <Box key={BAND_ROOT} flexDirection="column" paddingTop={1}>
      <Box key={BAND_ROW} columnGap={1} flexShrink={0}>
        {mine}
      </Box>
      {below}
    </Box>
  )
}

function capsule(Text: ElementConstructor<TextProps>, label: string, color: string, caps: boolean) {
  if (!caps) {
    return [
      <Text color={color} weight="semibold">
        {label}
      </Text>,
    ]
  }
  return [
    <Text color={PILL_BG}>{''}</Text>,
    <Text backgroundColor={PILL_BG} color={color} weight="semibold">
      {` ${label} `}
    </Text>,
    <Text color={PILL_BG}>{''}</Text>,
  ]
}

/** The graph's columns as runs of one lane's colour each: two columns to a lane, a commit a dot. */
export function lanes(Text: ElementConstructor<TextProps>, graph: string) {
  const runs: RenderElement[] = []
  let text = ''
  let color: string | undefined
  const flush = () => {
    if (text !== '') runs.push(<Text color={color}>{text}</Text>)
    text = ''
  }
  for (let i = 0; i < graph.length; i++) {
    const char = graph[i]!
    const next = char === ' ' ? undefined : LANES[Math.floor(i / 2) % LANES.length]
    if (next !== color && char !== ' ') {
      flush()
      color = next
    }
    text += char === '*' ? '●' : char
  }
  flush()
  return runs
}

function refLabel(ref: Ref) {
  return ref.kind === 'tag' ? `◆ ${ref.name}` : ref.kind === 'head' ? 'HEAD →' : ref.name
}

/** A row of the graph, one line in the monospace face, cut at the pane's edge. */
function row(Text: ElementConstructor<TextProps>, r: Row) {
  const c = r.commit
  return (
    <Text mono wrap="truncate-end">
      {lanes(Text, r.graph)}
      {c !== undefined && [
        ' ',
        <Text color={LANES[2]}>{c.hash}</Text>,
        ' ',
        ...c.refs.flatMap(ref => [
          <Text color={REF_COLOR[ref.kind]} weight="bold">
            {refLabel(ref)}
          </Text>,
          ' ',
        ]),
        c.subject,
        ' ',
        <Text dimColor>
          · {c.author}, {c.age}
        </Text>,
      ]}
    </Text>
  )
}

const clockTime = (ms: number) => {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'git-graph', description: 'Show the commit graph of every branch in a pane' })
    $.clock.every(TICK_MS, () => {
      if (isOpen) void refresh($)
    })
    return next(e)
  })

  on('command.run', { command: 'git-graph' }, async $ => {
    await open($)
    return { text: 'Git Graph opened.' }
  })

  // A turn may have committed, switched branch or fetched.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (isOpen) await refresh($)
    return result
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) isOpen = false
    return next(e)
  })

  // Shares the row of buttons with the mods beneath, the engine's band under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const below = await next(e)

    return joinBand(
      Box,
      Text,
      <Button key="git-graph" plain onPress={() => open($)}>
        {capsule(Text, 'Graph', COLOR, e.surface === 'terminal')}
      </Button>,
      below,
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // A graphical surface gets the tree drawn; the terminal (whose Svg is its alt), as git draws it.
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    const caps = e.surface === 'terminal'
    const g = await read($, graph)
    // The terminal's rows are cells wide; elsewhere a ruled line would wrap, so space alone parts the lists.
    const rule = caps ? <Text dimColor>{'─'.repeat(Math.max(8, e.props.bodyColumns - 4))}</Text> : null

    if (g === null) {
      return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Reading the repository…</Text>
        </Box>
      )
    }

    const head = g.local.find(b => b.isHead)
    const toggle = (patch: Partial<Graph>) => update($, graph, now => (now === null ? now : { ...now, ...patch }))

    // Copies a name (a branch in the lists, a branch or tag in the tree) or a hash. `id` is its
    // place (`local-0`, `ref-3-1`, `hash-2`): keys are letters, digits and dashes, and a
    // name has slashes.
    const copy = (id: string, text: string) => async (p: UiPressArgument) => {
      const copied = await $.ui.copy({ text, surface: p.surface })
      if (copied.isCopied) await toggle({ copied: id })
      else await $.ui.toast(`Could not copy ${text}: ${copied.reason}`)
    }
    // A graphical surface draws it as a native button, a press copying it; the
    // terminal, as a button that, pressed, shows a copy button beside it.
    const name = (id: string, text: string, label: string, color: string, isBold: boolean) => {
      if (!caps) {
        return [
          <Button key={`copy-${id}`} onPress={copy(id, text)}>
            <Text weight={isBold ? 'bold' : 'semibold'}>{label}</Text>
            {g.copied === id && <Text color="#8ec07c"> ✓</Text>}
          </Button>,
        ]
      }
      const isPicked = g.picked?.id === id
      return [
        <Button key={`name-${id}`} label={text} plain onPress={() => toggle({ picked: isPicked ? null : { id, name: text }, copied: null })}>
          <Text color={color} weight={isBold ? 'bold' : 'semibold'} underline={isPicked} mono>
            {label}
          </Text>
        </Button>,
        ...(isPicked
          ? [
              <Button key={`copy-${id}`} label={g.copied === id ? `Copied ${text}` : `Copy ${text}`} plain onPress={copy(id, text)}>
                {capsule(Text, g.copied === id ? '✓ Copied' : '⧉ Copy name', PILL_FG, caps)}
              </Button>,
            ]
          : []),
      ]
    }
    const branchRow = (id: string, text: string, color: string, isBold: boolean, before: RenderElement[], after: RenderElement) => (
      <Box columnGap={1}>
        {before}
        {name(id, text, text, color, isBold)[0]}
        {after}
        {name(id, text, text, color, isBold).slice(1)}
      </Box>
    )

    // The tree on a graphical surface: a row per commit, its slice of the lanes
    // drawn, the rest elements, so a branch or tag in it can be pressed.
    const tree = (Svg: ElementConstructor<SvgProps>) => {
      const commits = g.rows.flatMap(r => (r.commit === undefined ? [] : [r.commit]))
      const lay = layout(commits)
      const width = lanesWidth(lay)
      const isCut = commits.length >= (g.limit ?? PAGE)
      return commits.map((c, i) => {
        const isHead = c.refs.some(r => r.kind === 'head')
        return (
          <Box alignItems="center" columnGap={1} overflow="hidden">
            <Svg source={rowSvg(lay, isHead, i, commits.length, isCut)} alt={`● ${c.hash}`} width={width} height={ROW} />
            {c.refs.flatMap((ref, j) =>
              ref.kind === 'head'
                ? []
                : name(`ref-${i}-${j}`, ref.name, refLabel(ref), REF_COLOR[ref.kind], isHead && ref.kind === 'local'),
            )}
            {/* The subject takes what is left and is cut there, so the columns after it keep their place. */}
            <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Text wrap="truncate-end">{c.subject}</Text>
            </Box>
            <Box width={26} flexShrink={0} overflow="hidden">
              <Text dimColor wrap="truncate-end">
                {c.author} · {c.age}
              </Text>
            </Box>
            {/* Fixed, as the hash is drawn in the button's face, not in a monospace one. */}
            <Box width={10} flexShrink={0}>
              <Button key={`hash-${i}`} plain onPress={copy(`hash-${i}`, c.full)}>
                <Text color={LANES[2]} mono>
                  {c.hash}
                </Text>
                {g.copied === `hash-${i}` && <Text color="#8ec07c"> ✓</Text>}
              </Button>
            </Box>
          </Box>
        )
      })
    }

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} rowGap={1}>
        <Box justifyContent="space-between">
          <Box columnGap={1}>
            <Box>{capsule(Text, 'Git Graph', COLOR, caps)}</Box>
            <Text dimColor>
              {head ? `⎇ ${head.name}` : 'detached HEAD'} · {g.local.length} local · {g.remote.length} remote
            </Text>
          </Box>
          <Text dimColor>{g.status === 'loading' ? '◔ reading…' : g.at > 0 ? `read at ${clockTime(g.at)}` : ''}</Text>
        </Box>

        <Box columnGap={2} flexWrap="wrap">
          <Button key="refresh" plain onPress={() => refresh($)}>
            {capsule(Text, '↻ Refresh', PILL_FG, caps)}
          </Button>
          {/* Every branch or the checked-out one: the one shown is lit (a desktop's primary button). */}
          {([
            ['scope-all', 'All branches', true],
            ['scope-current', 'Current branch', false],
          ] as const).map(([key, label, isAll]) =>
            caps ? (
              <Button key={key} plain onPress={() => refresh($, isAll)}>
                {capsule(Text, label, g.isAll === isAll ? COLOR : PILL_FG, caps)}
              </Button>
            ) : (
              <Button key={key} label={label} variant={g.isAll === isAll ? 'primary' : 'secondary'} onPress={() => refresh($, isAll)} />
            ),
          )}
          <Button key="branches" plain onPress={() => toggle({ isBranchesOpen: !g.isBranchesOpen })}>
            {capsule(Text, g.isBranchesOpen ? '▾ Branches' : '▸ Branches', PILL_FG, caps)}
          </Button>
          <Button key="close" plain onPress={() => $.ui.close({ id: PANE })}>
            {capsule(Text, '✕ Close', PILL_FG, caps)}
          </Button>
        </Box>

        {g.status === 'error' && <Text color="error">✗ {g.error}</Text>}

        {g.isBranchesOpen && g.local.length + g.remote.length > 0 && (
          <Box flexDirection="column">
            {rule}
            <Text weight="bold">Local</Text>
            {g.local.map((b, i) =>
              branchRow(
                `local-${i}`,
                b.name,
                REF_COLOR.local,
                b.isHead,
                [
                  <Text dimColor={!b.isHead} color={b.isHead ? REF_COLOR.head : undefined} mono>
                    {b.isHead ? '●' : ' '}
                  </Text>,
                ],
                <Text mono wrap="truncate-end">
                  <Text color={LANES[2]}>{b.hash}</Text>
                  {b.upstream !== undefined && <Text dimColor> → {b.upstream}</Text>}
                  {b.ahead > 0 && <Text color="#8ec07c"> ↑{b.ahead}</Text>}
                  {b.behind > 0 && <Text color="#fe8019"> ↓{b.behind}</Text>}
                  {b.isGone && <Text color="#fb4934"> gone</Text>}
                </Text>,
              ),
            )}
            {g.remote.length > 0 && <Text weight="bold">Remote</Text>}
            {g.remote.map((b, i) =>
              branchRow(`remote-${i}`, b.name, REF_COLOR.remote, false, caps ? [<Text mono> </Text>] : [], <Text color={LANES[2]} mono>{b.hash}</Text>),
            )}
          </Box>
        )}

        <Box flexDirection="column">
          {rule}
          {g.rows.length === 0 && g.status === 'done' && <Text dimColor>No commits yet.</Text>}
          {g.rows.length > 0 && Svg !== undefined && tree(Svg)}
          {Svg === undefined && g.rows.map(r => row(Text, r))}
          {/* Older commits were left out: read another page of them. */}
          {g.status !== 'error' && g.rows.filter(r => r.commit !== undefined).length >= (g.limit ?? PAGE) && (
            <Box paddingTop={1}>
              <Button key="more" plain onPress={() => refresh($, g.isAll, (g.limit ?? PAGE) + PAGE)}>
                {capsule(Text, g.status === 'loading' ? '◔ Loading…' : `↓ Load ${PAGE} more`, PILL_FG, caps)}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    )
  })
}
