import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { PANE } from './register'

declare function setTimeout(callback: () => void, ms: number): unknown

const BAND = {
  plugin: 'how-why-teach',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const PANE_TARGET = {
  plugin: 'how-why-teach',
  surface: 'terminal',
  component: 'Pane',
  requestId: PANE,
  props: { title: 'How', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const SKILL = '---\nname: how\ndescription: Explain how.\n---\n\n# How\n\nExplain the mechanism.\n'

// A clock that moves 4 s on each read, so a fork reads as taking 4 s.
function clock(on: On) {
  let now = 0
  on('clock.now', () => ({ value: (now += 4000) }))
}

// What the engine draws beneath the plugins' bands: here a line of its own.
function engineBand(on: On, text = 'engine band') {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, text) as ReturnType<typeof Text>
  })
}

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))

test('a button answers in the pane from a fork of the session, never through a prompt', async ($, on) => {
  clock(on)
  const reads: string[] = []
  on('fs.read', (_, e) => {
    reads.push(e.path)
    return { value: SKILL }
  })
  const forks: string[] = []
  const submits: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true as const, text: 'The **how** of it.', usage: USAGE } }
  })
  on('prompt.submit', (_, e) => {
    submits.push(e.text)
    return { text: e.text }
  })
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  engineBand(on)
  const band = await $.ui.mount(BAND)

  expect(await band.findAll({ type: 'Button' })).toHaveLength(3)
  await band.press({ key: 'how' })
  await settle()

  expect(submits).toEqual([])
  expect(reads[0]).toMatch(/\/skills\/how\/SKILL\.md$/)
  expect(forks).toHaveLength(1)
  expect(forks[0]).toContain('# How')
  expect(forks[0]).not.toContain('description:')
  expect(opened).toEqual([PANE])
  const pane = await $.ui.mount(PANE_TARGET)
  expect((await pane.find({ key: 'answer' }))?.text).toContain('how')
  expect(await pane.find({ type: 'Text', text: '4s' })).toBeDefined()
  expect((await pane.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['again', 'copy', 'artifact', 'close'])

  await pane.press({ key: 'again' })
  await settle()
  expect(forks).toHaveLength(2)
})

test('a fork with no answer shows why in the pane', async ($, on) => {
  clock(on)
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.read', () => ({ value: SKILL }))
  on('model.fork', () => ({ value: { isAnswered: false as const, reason: 'nothing-to-fork' as const, usage: USAGE } }))
  engineBand(on)
  const band = await $.ui.mount(BAND)

  await band.press({ key: 'teach' })
  await settle()

  const pane = await $.ui.mount(PANE_TARGET)
  expect(await pane.find({ type: 'Text', text: /nothing-to-fork/ })).toBeDefined()
  expect((await pane.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['again', 'close'])
})

test('the band yields to a survey', async ($, on) => {
  engineBand(on)
  const band = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true } })

  expect(await band.findAll({ type: 'Button' })).toHaveLength(0)
})

test('Artifact lays the answer out, writes it out of git and publishes it', async ($, on) => {
  clock(on)
  const writes: { path: string; text: string }[] = []
  const published: unknown[] = []
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.read', (_, e) => ({ value: e.path.endsWith('exclude') ? '# git ls-files --others\n' : SKILL }))
  on('fs.exists', () => ({ value: true }))
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('model.fork', () => ({ value: { isAnswered: true as const, text: '# Lesson', usage: USAGE } }))
  on('model.complete', () => ({ value: { isAnswered: true as const, text: '```html\n<h1>Lesson</h1>\n```', usage: USAGE } }))
  on('tool.call', { tool: 'Artifact' }, (_, e) => {
    published.push(e)
    return { result: 'Published https://claude.ai/code/artifact/abc-123 (private)' }
  })
  engineBand(on)
  const band = await $.ui.mount(BAND)

  await band.press({ key: 'teach' })
  await settle()
  const pane = await $.ui.mount(PANE_TARGET)
  await pane.press({ key: 'artifact' })
  await settle()

  expect(writes[0]?.path).toMatch(/\/\.git\/info\/exclude$/)
  expect(writes[0]?.text).toBe('# git ls-files --others\n.claude/how-why-teach/\n')
  expect(writes[1]?.path).toMatch(/\/\.claude\/how-why-teach\/teach-\d+\.html$/)
  expect(writes[1]?.text).toContain('<title>Session lesson</title>')
  expect(writes[1]?.text).toContain('<h1>Lesson</h1>')
  expect(writes[1]?.text).not.toContain('```')
  expect(published).toMatchObject([{ file_path: expect.stringMatching(/^\.claude\/how-why-teach\/teach-\d+\.html$/), icon: 'book' }])
  expect((await pane.find({ type: 'Link' }))?.props).toMatchObject({ href: 'https://claude.ai/code/artifact/abc-123' })
  expect((await pane.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['again', 'copy', 'open', 'close'])
})

test('the band shares its row with the bands beneath', async ($, on) => {
  engineBand(on, 'another band')
  const band = await $.ui.mount(BAND)

  expect(await band.findAll({ type: 'Button' })).toHaveLength(3)
  expect(await band.find({ type: 'Text', text: 'another band' })).toBeDefined()
})
