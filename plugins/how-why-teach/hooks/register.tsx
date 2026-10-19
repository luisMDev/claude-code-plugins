import { atom, read, update } from 'claude-code'
import type { BoxProps, ElementConstructor, EngineInterface, Register, RenderElement, TextProps } from 'claude-code'

import type { Answer } from '../types'

import { ARTIFACT_DIR, BODY_SYSTEM, page, stripFences } from './artifact'

const BUTTONS = [
  { key: 'how', label: 'How', color: '#87afaf', subtitle: "How it's done", page: 'How it works' },
  { key: 'why', label: 'Why', color: '#ffaf00', subtitle: 'Why this way', page: 'Why this way' },
  { key: 'teach', label: 'Teach', color: '#afaf00', subtitle: 'Lesson', page: 'Session lesson' },
] as const

// The status line's capsule: rounded caps (Nerd Font) around a filled body.
// Only the terminal gets the caps: other surfaces have no Nerd Font and draw
// their own buttons, so they get the body alone.
const PILL_BG = '#504945'
const PILL_FG = '#ebdbb2'

export const PANE = 'how-why-teach'
const answer = atom({ plugin: 'how-why-teach', key: 'answer' } as const, null)
const selected = atom({ plugin: 'how-why-teach', key: 'selected' } as const, null)

// The skill's instructions without their frontmatter, as the fork's question;
// with a selection, scoped to that passage of the session.
export const forkPrompt = (skill: string, selection?: string) =>
  `${skill.replace(/^---\n[\s\S]*?\n---\n/, '').trim()}\n\n` +
  (selection === undefined
    ? 'Apply these instructions now to what we are doing in this session. Do not call tools.'
    : 'Apply these instructions now to this passage of the session, which the person selected. ' +
      'Explain the passage, using the rest of the session as context. Do not call tools.\n\n' +
      selection.replace(/^/gm, '> '))

// Only the latest press writes its answer; an older fork that lands late is dropped.
let latest = 0

async function ask($: EngineInterface, mode: Answer['mode'], title: string, selection: string | undefined) {
  const run = ++latest
  const startedAt = await $.clock.now()
  await update($, answer, () => ({ mode, selection, status: 'loading' as const, text: '' }))

  let result: Answer
  try {
    await $.ui.open({ id: PANE, title })
    const skill = await $.fs.read(`${$.plugin.root}/skills/${mode}/SKILL.md`)
    const reply = await $.model.fork({ prompt: forkPrompt(skill, selection) })
    const seconds = Math.round(((await $.clock.now()) - startedAt) / 1000)
    result = reply.isAnswered
      ? { mode, selection, status: 'done', text: reply.text, seconds }
      : { mode, selection, status: 'error', text: `No answer: ${reply.reason}`, seconds }
  } catch (error) {
    result = { mode, selection, status: 'error', text: String(error) }
  }

  if (run === latest) {
    await update($, answer, () => result)
  }
}

// No event says the selection changed, so a timer reads it and writes it only
// when it did: the band redraws then, never on the ticks in between.
const WATCH_MS = 500
let seen: string | null = null

// The engine keeps the last selection after a click takes its highlight down,
// and no event says it did. So a selection counts until it is spent: answered
// once, dropped with the badge's ✕, or left unused for ten seconds. The same
// text selected again stays spent.
let spent: string | null = null

const current = async ($: EngineInterface) => {
  const text = (await $.ui.selection())?.text.trim() || null
  return text === spent ? null : text
}

// A selection the buttons have not used within this long is dropped.
const SELECTION_TTL_MS = 10_000
let seenAt = 0

async function watchSelection($: EngineInterface) {
  const text = await current($)
  const now = await $.clock.now()
  if (text !== null && text === seen && now - seenAt >= SELECTION_TTL_MS) {
    await spend($, text)
  } else if (text !== seen) {
    seen = text
    seenAt = now
    await update($, selected, () => text)
  }
}

async function spend($: EngineInterface, text: string) {
  spent = text
  seen = null
  await update($, selected, () => null)
}

// Whether the prompt, once this edit lands, is a /command.
export const isCommand = (e: { text: string; start: number; end: number; inputText: string }) =>
  (e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)).startsWith('/')

// A button's press: about the selection when one counts, which it spends.
async function press($: EngineInterface, mode: Answer['mode'], title: string) {
  const text = await current($)
  if (text !== null) {
    await spend($, text)
  }
  await ask($, mode, title, text ?? undefined)
}

// What the band notes beside the buttons: the lines they will answer about.
function selectionBadge(text: string) {
  const lines = text.split('\n').length
  return lines > 1 ? `↳ ${lines} selected lines` : `↳ “${text.length > 24 ? `${text.slice(0, 24)}…` : text}”`
}

// Keeps the pages out of git without touching the project's .gitignore.
async function excludeFromGit($: EngineInterface) {
  const exclude = '.git/info/exclude'
  if (!(await $.fs.exists(exclude))) {
    return
  }
  const text = await $.fs.read(exclude)
  if (!text.includes(ARTIFACT_DIR)) {
    await $.fs.write(exclude, `${text.trimEnd()}\n${ARTIFACT_DIR}/\n`)
  }
}

// Lays the answer out as a page, writes it to the working directory and
// publishes it with the Artifact tool, which asks the person first.
async function publish($: EngineInterface, shown: Answer) {
  const run = latest
  const mode = BUTTONS.find(b => b.key === shown.mode)!
  const set = (artifact: Answer['artifact']) =>
    update($, answer, now => (run === latest && now !== null ? { ...now, artifact } : now))
  await set({ status: 'publishing', text: '' })

  try {
    const body = await $.model.complete({ model: 'sonnet', system: BODY_SYSTEM, prompt: shown.text, maxTokens: 16000 })
    if (!body.isAnswered) {
      await set({ status: 'error', text: `No page: ${body.reason}` })
      return
    }
    const path = `${ARTIFACT_DIR}/${mode.key}-${await $.clock.now()}.html`
    await excludeFromGit($)
    await $.fs.write(path, page(mode.page, mode.color, stripFences(body.text)))
    const published = await $.tool.call({
      tool: 'Artifact',
      file_path: path,
      icon: 'book',
      description: `${mode.page}: an explanation of a Claude Code session.`,
    })
    const url = (published.text ?? JSON.stringify(published.result ?? '')).match(/https:\/\/claude\.ai\/[^\s)"'`]+/)?.[0]
    await set(
      published.deny !== undefined || published.isError || url === undefined
        ? { status: 'error', text: published.deny ?? published.text ?? 'Not published.' }
        : { status: 'done', text: url },
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

// The selection's first line, cut short, for the pane's header.
const snippet = (text: string) => {
  const first = text.split('\n')[0]!
  return first.length > 60 || text.includes('\n') ? `${first.slice(0, 60)}…` : first
}

function capsule(Text: ElementConstructor<TextProps>, label: string, color: string, caps: boolean) {
  const body = (
    <Text backgroundColor={PILL_BG} color={color} bold>
      {` ${label} `}
    </Text>
  )
  return caps ? [<Text color={PILL_BG}>{''}</Text>, body, <Text color={PILL_BG}>{''}</Text>] : [body]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (e.isInteractive) {
      $.clock.every(WATCH_MS, () => void watchSelection($))
    }
    return next(e)
  })

  // Shares the row of buttons with the mods beneath, the engine's band under it.
  // A turn or a command that ends makes the engine forget the selection: the
  // badge goes now rather than on the next tick.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await watchSelection($)
    return result
  })
  on('command.run', async ($, e, next) => {
    const result = await next(e)
    await watchSelection($)
    return result
  })

  // A key in the prompt takes the highlight down, so the selection no longer
  // counts; a /command still reads it, as the engine means it to.
  on('prompt.edit', async ($, e, next) => {
    const result = await next(e)
    if (seen !== null && !isCommand(e)) {
      await spend($, seen)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    const caps = e.surface === 'terminal'
    const selection = await read($, selected)
    const below = await next(e)

    return joinBand(
      Box,
      Text,
      <Box flexShrink={0}>
        {BUTTONS.flatMap((b, i) => [
          ...(i > 0 ? [<Text key={`sep-${b.key}`} dimColor> · </Text>] : []),
          <Button key={b.key} plain onPress={() => press($, b.key, b.label)}>
            {capsule(Text, b.label, b.color, caps)}
          </Button>,
        ])}
        {selection !== null && <Text dimColor>{`  ${selectionBadge(selection)} `}</Text>}
        {selection !== null && (
          <Button key="forget-selection" plain onPress={() => spend($, selection)}>
            <Text dimColor>✕</Text>
          </Button>
        )}
      </Box>,
      below,
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Markdown, Text } = $.ui.resolve(e)
    const caps = e.surface === 'terminal'
    const shown = await read($, answer)
    const mode = BUTTONS.find(b => b.key === shown?.mode)
    const rule = <Text dimColor>{'─'.repeat(Math.max(8, e.props.bodyColumns - 4))}</Text>

    if (shown === null || mode === undefined) {
      return (
        <Box flexDirection="column" paddingX={2} paddingY={1}>
          <Text dimColor>Press How, Why or Teach above the prompt.</Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} rowGap={1}>
        <Box justifyContent="space-between">
          <Box columnGap={1}>
            <Box>{capsule(Text, mode.label, mode.color, caps)}</Box>
            <Text dimColor>{mode.subtitle}</Text>
          </Box>
          {shown.seconds !== undefined && <Text dimColor>{shown.seconds}s</Text>}
        </Box>
        {shown.selection !== undefined && <Text dimColor>About your selection: “{snippet(shown.selection)}”</Text>}
        {rule}
        {shown.status === 'loading' && (
          <Box flexDirection="column">
            <Text color={mode.color}>◔ Thinking…</Text>
            <Text dimColor>Reading the whole session without touching it.</Text>
            {mode.key === 'teach' && <Text dimColor>A lesson can take half a minute.</Text>}
          </Box>
        )}
        {shown.status === 'error' && <Text color="error">✗ {shown.text}</Text>}
        {shown.status === 'done' && (
          <Box paddingX={1}>
            <Markdown key="answer" text={shown.text} />
          </Box>
        )}
        {rule}
        {shown.artifact?.status === 'publishing' && <Text color={mode.color}>◆ Publishing the artifact…</Text>}
        {shown.artifact?.status === 'error' && <Text color="error">✗ {shown.artifact.text}</Text>}
        {shown.artifact?.status === 'done' && (
          <Box columnGap={1}>
            <Text color={mode.color}>◆</Text>
            <Link key="artifact-url" href={shown.artifact.text} label={shown.artifact.text} />
          </Box>
        )}
        <Box columnGap={2} flexWrap="wrap">
          {shown.status !== 'loading' && (
            <Button key="again" plain onPress={() => ask($, mode.key, mode.label, shown.selection)}>
              {capsule(Text, '↻ Again', PILL_FG, caps)}
            </Button>
          )}
          {shown.status === 'done' && (
            <Button key="copy" plain onPress={p => $.ui.copy({ text: shown.text, surface: p.surface })}>
              {capsule(Text, '⧉ Copy', PILL_FG, caps)}
            </Button>
          )}
          {shown.status === 'done' && shown.artifact?.status !== 'publishing' && shown.artifact?.status !== 'done' && (
            <Button key="artifact" plain onPress={() => publish($, shown)}>
              {capsule(Text, '◆ Artifact', PILL_FG, caps)}
            </Button>
          )}
          {shown.artifact?.status === 'done' && (
            <Button key="open" plain onPress={() => $.tool.call({ tool: 'Artifact', action: 'open', url: shown.artifact!.text })}>
              {capsule(Text, '↗ Open', PILL_FG, caps)}
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
