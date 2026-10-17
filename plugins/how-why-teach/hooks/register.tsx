import type { Register } from 'claude-code'

const BUTTONS = [
  { key: 'how', label: 'How' },
  { key: 'why', label: 'Why' },
  { key: 'teach', label: 'Teach' },
] as const

export const prompt = (skill: string) =>
  `Use the how-why-teach:${skill} skill on what we are doing in this session.`

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box>
        {BUTTONS.map(b => (
          <Button
            key={b.key}
            label={b.label}
            onPress={() => $.prompt.submit({ text: prompt(b.key), asUser: true })}
          />
        ))}
      </Box>
    )
  })
}
