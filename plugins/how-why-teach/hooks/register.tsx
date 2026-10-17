import type { Register } from 'claude-code'

const BUTTONS = [
  { key: 'how', label: 'How', color: '#87afaf' },
  { key: 'why', label: 'Why', color: '#ffaf00' },
  { key: 'teach', label: 'Teach', color: '#afaf00' },
] as const

// The status line's capsule: rounded caps (Nerd Font) around a filled body.
const PILL_BG = '#504945'

export const prompt = (skill: string) =>
  `Use the how-why-teach:${skill} skill on what we are doing in this session.`

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
          <Button
            key={b.key}
            plain
            onPress={() => $.prompt.submit({ text: prompt(b.key), asUser: true })}
          >
            <Text color={PILL_BG}>{'\ue0b6'}</Text>
            <Text backgroundColor={PILL_BG} color={b.color} bold>
              {` ${b.label} `}
            </Text>
            <Text color={PILL_BG}>{'\ue0b4'}</Text>
          </Button>,
        ])}
      </Box>
    )
  })
}
