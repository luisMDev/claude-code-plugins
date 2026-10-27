import { atom, read, update } from 'claude-code'
import type { BoxProps, ElementConstructor, EngineInterface, Register, RenderElement, TextProps } from 'claude-code'

import type { Handoff } from '../types'

// The status line's capsule: rounded caps (Nerd Font) around a filled body.
// Only the terminal draws it: other surfaces have no Nerd Font and draw their
// own buttons, where a filled body would be a second button inside the first,
// so there the label is drawn alone, in its color.
const PILL_BG = '#504945'
const PILL_FG = '#ebdbb2'
const COLOR = '#d787af'

export const PANE = 'handoff'
const handoff = atom({ plugin: 'handoff', key: 'handoff' } as const, null)

// The fork has no tools, so it writes the document and the plugin saves it.
// A request (what the person typed in the prompt) goes along, followed where it
// differs from the skill.
export const forkPrompt = (skill: string, request?: string) =>
  `${skill.replace(/^---\n[\s\S]*?\n---\n/, '').trim()}\n\n` +
  'You cannot call tools here: reply with the handoff document alone, in Markdown. ' +
  'The plugin saves it and hands it to the next session.' +
  (request === undefined
    ? ''
    : `\n\nThe person adds this request; where it differs from the instructions above, it wins:\n\n${request.replace(/^/gm, '> ')}`)

export const sessionPrompt = (path: string) =>
  `Read ${path}: a handoff from a previous Claude Code session. ` +
  'Summarise where the work stands and what is pending, then wait for my instructions.'

// Only the latest press writes its document; an older fork that lands late is dropped.
let latest = 0

// What the person typed in the prompt, taken out of it: their request.
async function takeRequest($: EngineInterface) {
  const request = (await $.prompt.read()).text.trim()
  if (request === '') {
    return undefined
  }
  await $.prompt.fill({ text: '', mode: 'replace' })
  return request
}

async function write($: EngineInterface, request: string | undefined) {
  const run = ++latest
  const startedAt = await $.clock.now()
  await update($, handoff, () => ({ request, status: 'loading' as const, text: '' }))

  // The fork answers whole, never in parts: the pane counts the seconds meanwhile.
  const elapsed = async () => Math.round(((await $.clock.now()) - startedAt) / 1000)
  const tick = $.clock.every(1000, async () => {
    const seconds = await elapsed()
    await update($, handoff, now => (run === latest && now?.status === 'loading' ? { ...now, seconds } : now))
  })

  let result: Handoff
  try {
    await $.ui.open({ id: PANE, title: 'Handoff' })
    const skill = await $.fs.read(`${$.plugin.root}/skills/handoff/SKILL.md`)
    const reply = await $.model.fork({ prompt: forkPrompt(skill, request) })
    const seconds = await elapsed()
    result = reply.isAnswered
      ? { request, status: 'done', text: reply.text, seconds, tokens: reply.usage.output_tokens }
      : { request, status: 'error', text: `No answer: ${reply.reason}`, seconds }
  } catch (error) {
    result = { request, status: 'error', text: String(error) }
  } finally {
    tick.cancel()
  }

  if (run === latest) {
    await update($, handoff, () => result)
  }
}

// Saves the document where the skill says, then starts a background session on it.
async function start($: EngineInterface, doc: string) {
  const run = latest
  const set = (session: Handoff['session']) =>
    update($, handoff, now => (run === latest && now !== null ? { ...now, session } : now))
  await set({ status: 'starting', text: '' })

  try {
    const temp = await $.process.run(['mktemp', '-t', 'handoff-XXXXXX.md'])
    const path = temp.stdout.trim()
    if (temp.exitCode !== 0 || path === '') {
      await set({ status: 'error', text: `mktemp failed: ${temp.stderr.trim()}` })
      return
    }
    await $.fs.write(path, doc)
    const bg = await $.process.run(['claude', '--bg', sessionPrompt(path)], { cwd: await $.session.cwd() })
    const id = bg.stdout.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|\b[0-9a-f]{8}\b/)?.[0]
    await set(
      bg.exitCode === 0 && id !== undefined
        ? { status: 'done', text: id, path }
        : { status: 'error', text: (bg.stderr || bg.stdout).trim() || `claude --bg exited ${bg.exitCode}`, path },
    )
  } catch (error) {
    await set({ status: 'error', text: String(error) })
  }
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

// A text's first line, cut short, for the pane's header.
const snippet = (text: string) => {
  const first = text.split('\n')[0]!
  return first.length > 60 || text.includes('\n') ? `${first.slice(0, 60)}…` : first
}

// A token count as people read it: 820, 1.1k.
const count = (n: number) => (n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`)

function capsule(Text: ElementConstructor<TextProps>, label: string, color: string, caps: boolean) {
  if (!caps) {
    return [
      <Text color={color} weight="semibold">
        {label}
      </Text>,
    ]
  }
  const body = (
    <Text backgroundColor={PILL_BG} color={color} weight="semibold">
      {` ${label} `}
    </Text>
  )
  return [<Text color={PILL_BG}>{''}</Text>, body, <Text color={PILL_BG}>{''}</Text>]
}

export const register: Register = on => {
  // Shares the row of buttons with the mods beneath, the engine's band under it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    const caps = e.surface === 'terminal'
    const below = await next(e)

    return joinBand(
      Box,
      Text,
      <Button key="handoff" plain onPress={async () => write($, await takeRequest($))}>
        {capsule(Text, 'Handoff', COLOR, caps)}
      </Button>,
      below,
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const caps = e.surface === 'terminal'
    const shown = await read($, handoff)
    // bodyColumns counts monospace cells: drawn in that face, the rule fits on every surface.
    const rule = <Text dimColor mono>{'─'.repeat(Math.max(8, e.props.bodyColumns - 4))}</Text>

    if (shown === null) {
      return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Press Handoff above the prompt.</Text>
        </Box>
      )
    }

    const session = shown.session

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} rowGap={1}>
        <Box justifyContent="space-between">
          <Box columnGap={1}>
            <Box>{capsule(Text, 'Handoff', COLOR, caps)}</Box>
            <Text dimColor>For the next session</Text>
          </Box>
          {shown.status !== 'loading' && shown.seconds !== undefined && (
            <Text dimColor>{shown.tokens === undefined ? `${shown.seconds}s` : `${shown.seconds}s · ${count(shown.tokens)} tokens`}</Text>
          )}
        </Box>
        {shown.request !== undefined && <Text dimColor>Your request: “{snippet(shown.request)}”</Text>}
        {rule}
        {shown.status === 'loading' && (
          <Box flexDirection="column">
            <Text color={COLOR}>◔ Writing the handoff… {shown.seconds ?? 0}s</Text>
            <Text dimColor>Reading the whole session without touching it.</Text>
          </Box>
        )}
        {shown.status === 'error' && <Text color="error">✗ {shown.text}</Text>}
        {shown.status === 'done' && (
          <Box paddingX={1}>
            <Markdown key="doc" text={shown.text} />
          </Box>
        )}
        {rule}
        {session?.status === 'starting' && <Text color={COLOR}>⇢ Starting a background session…</Text>}
        {session?.status === 'error' && <Text color="error">✗ {session.text}</Text>}
        {session?.status === 'done' && (
          <Box flexDirection="column">
            <Text color={COLOR}>⇢ Session {session.text} started in the background.</Text>
            <Text dimColor>Join it: claude attach {session.text}</Text>
            <Text dimColor>Handoff file: {session.path}</Text>
          </Box>
        )}
        <Box columnGap={2} flexWrap="wrap">
          {shown.status !== 'loading' && (
            <Button key="again" plain onPress={() => write($, shown.request)}>
              {capsule(Text, '↻ Again', PILL_FG, caps)}
            </Button>
          )}
          {shown.status === 'done' && (
            <Button key="copy" plain onPress={p => $.ui.copy({ text: shown.text, surface: p.surface })}>
              {capsule(Text, '⧉ Copy', PILL_FG, caps)}
            </Button>
          )}
          {shown.status === 'done' && session?.status !== 'starting' && session?.status !== 'done' && (
            <Button key="session" plain onPress={() => start($, shown.text)}>
              {capsule(Text, '⇢ New session', PILL_FG, caps)}
            </Button>
          )}
          {session?.status === 'done' && (
            <Button key="attach" plain onPress={p => $.ui.copy({ text: `claude attach ${session.text}`, surface: p.surface })}>
              {capsule(Text, '⧉ Copy attach', PILL_FG, caps)}
            </Button>
          )}
          <Button key="close" plain onPress={() => $.ui.close({ id: PANE })}>
            {capsule(Text, '✕ Close', PILL_FG, caps)}
          </Button>
        </Box>
      </Box>
    )
  })
}
