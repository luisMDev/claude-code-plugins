import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Answer } from '../types'

const BUTTONS = [
  { key: 'how', label: 'How', color: '#87afaf' },
  { key: 'why', label: 'Why', color: '#ffaf00' },
  { key: 'teach', label: 'Teach', color: '#afaf00' },
] as const

// The status line's capsule: rounded caps (Nerd Font) around a filled body.
const PILL_BG = '#504945'

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
  await update($, answer, () => ({ mode, status: 'loading' as const, text: '' }))

  let result: Answer
  try {
    await $.ui.open({ id: PANE, title })
    const skill = await $.fs.read(`${$.plugin.root}/skills/${mode}/SKILL.md`)
    const reply = await $.model.fork({ prompt: forkPrompt(skill) })
    result = reply.isAnswered
      ? { mode, status: 'done', text: reply.text }
      : { mode, status: 'error', text: `No answer: ${reply.reason}` }
  } catch (error) {
    result = { mode, status: 'error', text: String(error) }
  }

  if (run === latest) {
    await update($, answer, () => result)
  }
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
            <Text color={PILL_BG}>{''}</Text>
            <Text backgroundColor={PILL_BG} color={b.color} bold>
              {` ${b.label} `}
            </Text>
            <Text color={PILL_BG}>{''}</Text>
          </Button>,
        ])}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const shown = await read($, answer)

    return (
      <Box flexDirection="column">
        {shown === null && <Text dimColor>Press How, Why or Teach.</Text>}
        {shown?.status === 'loading' && <Text dimColor>Thinking…</Text>}
        {shown?.status === 'error' && <Text color="error">{shown.text}</Text>}
        {shown?.status === 'done' && <Markdown key="answer" text={shown.text} />}
        <Box>
          {shown?.status === 'done' && (
            <Button key="copy" label="Copy" onPress={p => $.ui.copy({ text: shown.text, surface: p.surface })} />
          )}
          <Button key="close" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
