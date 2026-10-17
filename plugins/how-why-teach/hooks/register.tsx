import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, TextProps } from 'claude-code'

import type { Answer } from '../types'

import { ARTIFACT_DIR, BODY_SYSTEM, page, stripFences } from './artifact'

const BUTTONS = [
  { key: 'how', label: 'How', color: '#87afaf', subtitle: "How it's done", page: 'How it works' },
  { key: 'why', label: 'Why', color: '#ffaf00', subtitle: 'Why this way', page: 'Why this way' },
  { key: 'teach', label: 'Teach', color: '#afaf00', subtitle: 'Lesson', page: 'Session lesson' },
] as const

// The status line's capsule: rounded caps (Nerd Font) around a filled body.
const PILL_BG = '#504945'
const PILL_FG = '#ebdbb2'

export const PANE = 'how-why-teach'
const answer = atom({ plugin: 'how-why-teach', key: 'answer' } as const, null)

// The skill's instructions without their frontmatter, as the fork's question.
export const forkPrompt = (skill: string) =>
  `${skill.replace(/^---\n[\s\S]*?\n---\n/, '').trim()}\n\n` +
  'Apply these instructions now to what we are doing in this session. Do not call tools.'

// Only the latest press writes its answer; an older fork that lands late is dropped.
let latest = 0

async function ask($: EngineInterface, mode: Answer['mode'], title: string) {
  const run = ++latest
  const startedAt = await $.clock.now()
  await update($, answer, () => ({ mode, status: 'loading' as const, text: '' }))

  let result: Answer
  try {
    await $.ui.open({ id: PANE, title })
    const skill = await $.fs.read(`${$.plugin.root}/skills/${mode}/SKILL.md`)
    const reply = await $.model.fork({ prompt: forkPrompt(skill) })
    const seconds = Math.round(((await $.clock.now()) - startedAt) / 1000)
    result = reply.isAnswered
      ? { mode, status: 'done', text: reply.text, seconds }
      : { mode, status: 'error', text: `No answer: ${reply.reason}`, seconds }
  } catch (error) {
    result = { mode, status: 'error', text: String(error) }
  }

  if (run === latest) {
    await update($, answer, () => result)
  }
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

function capsule(Text: ElementConstructor<TextProps>, label: string, color: string) {
  return [
    <Text color={PILL_BG}>{''}</Text>,
    <Text backgroundColor={PILL_BG} color={color} bold>
      {` ${label} `}
    </Text>,
    <Text color={PILL_BG}>{''}</Text>,
  ]
}

export const register: Register = on => {
  // Draws its buttons beside whatever the plugins beneath draw, so bands share the row.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const below = await next(e)

    return (
      <Box columnGap={3}>
        <Box>
          {BUTTONS.flatMap((b, i) => [
            ...(i > 0 ? [<Text key={`sep-${b.key}`} dimColor> · </Text>] : []),
            <Button key={b.key} plain onPress={() => ask($, b.key, b.label)}>
              {capsule(Text, b.label, b.color)}
            </Button>,
          ])}
        </Box>
        {below}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Markdown, Text } = $.ui.resolve(e)
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
            <Box>{capsule(Text, mode.label, mode.color)}</Box>
            <Text dimColor>{mode.subtitle}</Text>
          </Box>
          {shown.seconds !== undefined && <Text dimColor>{shown.seconds}s</Text>}
        </Box>
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
            <Button key="again" plain onPress={() => ask($, mode.key, mode.label)}>
              {capsule(Text, '↻ Again', PILL_FG)}
            </Button>
          )}
          {shown.status === 'done' && (
            <Button key="copy" plain onPress={p => $.ui.copy({ text: shown.text, surface: p.surface })}>
              {capsule(Text, '⧉ Copy', PILL_FG)}
            </Button>
          )}
          {shown.status === 'done' && shown.artifact?.status !== 'publishing' && shown.artifact?.status !== 'done' && (
            <Button key="artifact" plain onPress={() => publish($, shown)}>
              {capsule(Text, '◆ Artifact', PILL_FG)}
            </Button>
          )}
          {shown.artifact?.status === 'done' && (
            <Button key="open" plain onPress={() => $.tool.call({ tool: 'Artifact', action: 'open', url: shown.artifact!.text })}>
              {capsule(Text, '↗ Open', PILL_FG)}
            </Button>
          )}
          <Button key="close" plain onPress={() => $.ui.close({ id: PANE })}>
            {capsule(Text, '✕ Close', PILL_FG)}
          </Button>
        </Box>
      </Box>
    )
  })
}
