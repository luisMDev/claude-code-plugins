import type { Register } from 'claude-code'

const BUTTONS = [
  { key: 'how', label: 'How', color: 'suggestion' },
  { key: 'why', label: 'Why', color: 'warning' },
  { key: 'teach', label: 'Teach', color: 'success' },
] as const

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
            onPress={() => $.prompt.submit({ text: prompt(b.key), asUser: true })}
          >
            <Text color={b.color} bold>{b.label}</Text>
          </Button>,
        ])}
      </Box>
    )
  })
}
