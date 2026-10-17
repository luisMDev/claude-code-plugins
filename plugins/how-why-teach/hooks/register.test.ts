import { expect, test } from 'claude-code/testing'

import { prompt } from './register'

const BAND = {
  plugin: 'how-why-teach',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('each button submits a prompt that names its skill', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  const band = await $.ui.mount(BAND)

  expect(await band.findAll({ type: 'Button' })).toHaveLength(3)
  for (const key of ['how', 'why', 'teach']) {
    await band.press({ key })
  }
  expect(sent).toEqual([prompt('how'), prompt('why'), prompt('teach')])
})

test('the band yields to a survey', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'engine band') as ReturnType<typeof Text>
  })
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })

  expect(await band.findAll({ type: 'Button' })).toHaveLength(0)
})
