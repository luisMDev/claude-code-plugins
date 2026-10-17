import { atom, read, update } from 'claude-code'
import type { ElementConstructor, EngineInterface, Register, TextProps } from 'claude-code'

import type { Answer } from '../types'

const BUTTONS = [
  { key: 'how', label: 'How', color: '#87afaf', subtitle: "How it's done" },
  { key: 'why', label: 'Why', color: '#ffaf00', subtitle: 'Why this way' },
  { key: 'teach', label: 'Teach', color: '#afaf00', subtitle: 'Lesson' },
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
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        {BUTTONS.flatMap((b, i) => [
          ...(i > 0 ? [<Text key={`sep-${b.key}`} dimColor> · </Text>] : []),
          <Button key={b.key} plain onPress={() => ask($, b.key, b.label)}>
            {capsule(Text, b.label, b.color)}
          </Button>,
        ])}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
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
        <Box columnGap={2}>
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
          <Button key="close" plain onPress={() => $.ui.close({ id: PANE })}>
            {capsule(Text, '✕ Close', PILL_FG)}
          </Button>
        </Box>
      </Box>
    )
  })
}
