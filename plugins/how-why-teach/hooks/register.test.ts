import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

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

// Nothing selected on screen: the buttons explain the session as a whole.
const noSelection = (on: On) => on('ui.selection', () => ({ value: undefined }))

// Nothing typed in the prompt: no request goes with the question.
const emptyPrompt = (on: On) => on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))

test('a button answers in the pane from a fork of the session, never through a prompt', async ($, on) => {
  clock(on)
  noSelection(on)
  emptyPrompt(on)
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
  expect(forks[0]).not.toContain('The person adds this request')
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
  noSelection(on)
  emptyPrompt(on)
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
  noSelection(on)
  emptyPrompt(on)
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

test('the band shares one row with the mods beneath, the engine band under it', async ($, on) => {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return h(
      Box,
      { key: 'mod-band', flexDirection: 'column' },
      h(Box, { key: 'mod-buttons' }, h(Text, null, 'Other mod')),
      h(Text, null, 'engine notice'),
    ) as ReturnType<typeof Box>
  })
  const band = await $.ui.mount(BAND)

  const texts = (await band.findAll({ type: 'Text' })).map(t => t.text)
  const at = (text: string) => texts.indexOf(text)
  expect(at(' Teach ')).toBeGreaterThanOrEqual(0)
  expect(at(' Teach ')).toBeLessThan(at('·'))
  expect(at('·')).toBeLessThan(at('Other mod'))
  expect(at('Other mod')).toBeLessThan(at('engine notice'))
})

// The capsules' caps are Nerd Font glyphs: the terminal draws them, other surfaces have no such font.
const CAPS = /[]/

test('capsules have Nerd Font caps on the terminal and only their body on desktop', async ($, on) => {
  clock(on)
  noSelection(on)
  emptyPrompt(on)
  on('fs.read', () => ({ value: SKILL }))
  on('model.fork', () => ({ value: { isAnswered: true as const, text: 'Done.', usage: USAGE } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  engineBand(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'how' })
    await settle()
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })

    for (const site of [band, pane]) {
      const texts = (await site.findAll({ type: 'Text' })).map(t => t.text ?? '')
      expect(texts.some(t => CAPS.test(t))).toBe(surface === 'terminal')
      expect(texts).toContain(' How ')
    }
  }
})

test('a selection scopes the answer to that passage, and Again asks about it again', async ($, on) => {
  clock(on)
  on('fs.read', () => ({ value: SKILL }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  let selected: { text: string } | undefined = { text: '  Wrote 180 lines\nto index.astro  ' }
  on('ui.selection', () => ({ value: selected }))
  emptyPrompt(on)
  const forks: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true as const, text: 'That passage.', usage: USAGE } }
  })
  engineBand(on)
  const band = await $.ui.mount(BAND)

  await band.press({ key: 'why' })
  await settle()
  expect(forks[0]).toContain('this passage of the session, which the person selected')
  expect(forks[0]).toContain('> Wrote 180 lines\n> to index.astro')

  // The press took the highlight down: Again keeps the passage the answer is about.
  selected = undefined
  const pane = await $.ui.mount(PANE_TARGET)
  expect(await pane.find({ type: 'Text', text: 'About your selection: “Wrote 180 lines…”' })).toBeDefined()
  await pane.press({ key: 'again' })
  await settle()
  expect(forks[1]).toBe(forks[0])

  await band.press({ key: 'why' })
  await settle()
  expect(forks[2]).toContain('to what we are doing in this session')
  expect(forks[2]).not.toContain('> ')
})

test('the band notes the selection the buttons will answer about, and follows it', async ($, on) => {
  const time = mock.clock(on)
  let selected: { text: string } | undefined
  on('ui.selection', () => ({ value: selected }))
  emptyPrompt(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount(BAND)
  const badge = async () =>
    (await band.findAll({ type: 'Text' })).map(t => t.text?.trim()).find(t => t?.startsWith('↳'))

  expect(await badge()).toBeUndefined()
  selected = { text: 'one\ntwo\nthree' }
  await time.advance(500)
  expect(await badge()).toBe('↳ 3 selected lines')
  selected = { text: ' Wrote 180 lines to the landing page ' }
  await time.advance(500)
  expect(await badge()).toBe('↳ “Wrote 180 lines to the l…”')
  selected = undefined
  await time.advance(500)
  expect(await badge()).toBeUndefined()
})

test('a selection is spent once answered or dropped with ✕, until another is selected', async ($, on) => {
  const time = mock.clock(on)
  let selected: { text: string } | undefined = { text: 'one\ntwo' }
  on('ui.selection', () => ({ value: selected }))
  emptyPrompt(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: SKILL }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  const forks: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true as const, text: 'Answer.', usage: USAGE } }
  })
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount(BAND)
  const badge = async () =>
    (await band.findAll({ type: 'Text' })).map(t => t.text?.trim()).find(t => t?.startsWith('↳'))

  await time.advance(500)
  expect(await badge()).toBe('↳ 2 selected lines')

  // The click on How took the highlight down; the engine still answers the same text.
  await band.press({ key: 'how' })
  await time.settle()
  expect(forks[0]).toContain('> one\n> two')
  await time.advance(500)
  expect(await badge()).toBeUndefined()
  await band.press({ key: 'how' })
  await time.settle()
  expect(forks[1]).toContain('to what we are doing in this session')

  // A new selection counts again; ✕ drops it without an answer.
  selected = { text: 'three' }
  await time.advance(500)
  expect(await badge()).toBe('↳ “three”')
  await band.press({ key: 'forget-selection' })
  await time.advance(500)
  expect(await badge()).toBeUndefined()
  await band.press({ key: 'why' })
  await time.settle()
  expect(forks[2]).toContain('to what we are doing in this session')
})

test('a command that ends makes the badge go at once, with no tick', async ($, on) => {
  const time = mock.clock(on)
  let selected: { text: string } | undefined = { text: 'one' }
  on('ui.selection', () => ({ value: selected }))
  emptyPrompt(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: 'ran' }))
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount(BAND)
  const badge = async () =>
    (await band.findAll({ type: 'Text' })).map(t => t.text?.trim()).find(t => t?.startsWith('↳'))

  await time.advance(500)
  expect(await badge()).toBe('↳ “one”')
  selected = undefined
  await $.command.run({ command: 'compact', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect(await badge()).toBeUndefined()
})

test('a selection left unused for ten seconds is dropped', async ($, on) => {
  const time = mock.clock(on)
  let selected: { text: string } | undefined = { text: 'one' }
  on('ui.selection', () => ({ value: selected }))
  emptyPrompt(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', () => ({ value: SKILL }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  const forks: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true as const, text: 'Answer.', usage: USAGE } }
  })
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount(BAND)
  const badge = async () =>
    (await band.findAll({ type: 'Text' })).map(t => t.text?.trim()).find(t => t?.startsWith('↳'))

  await time.advance(500)
  expect(await badge()).toBe('↳ “one”')
  await time.advance(9000)
  expect(await badge()).toBe('↳ “one”')
  await time.advance(1000)
  expect(await badge()).toBeUndefined()
  await band.press({ key: 'how' })
  await time.settle()
  expect(forks[0]).toContain('to what we are doing in this session')

  // Another selection gets its own ten seconds.
  selected = { text: 'two' }
  await time.advance(500)
  expect(await badge()).toBe('↳ “two”')
})

test('what is typed in the prompt goes with the question as a request, and leaves the prompt', async ($, on) => {
  clock(on)
  on('fs.read', () => ({ value: SKILL }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  let selected: { text: string } | undefined = { text: 'Wrote 180 lines' }
  on('ui.selection', () => ({ value: selected }))
  let draft = '  explain it in English  '
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  const fills: { text: string; mode: string }[] = []
  on('prompt.fill', (_, e) => {
    fills.push({ text: e.text, mode: e.mode })
    draft = e.text
    return { isFilled: true }
  })
  const forks: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true as const, text: 'Done.', usage: USAGE } }
  })
  engineBand(on)
  const band = await $.ui.mount(BAND)

  await band.press({ key: 'teach' })
  await settle()
  expect(forks[0]).toContain('> Wrote 180 lines')
  expect(forks[0]).toContain('The person adds this request')
  expect(forks[0]).toContain('> explain it in English')
  expect(fills).toEqual([{ text: '', mode: 'replace' }])

  const pane = await $.ui.mount(PANE_TARGET)
  expect(await pane.find({ type: 'Text', text: 'Your request: “explain it in English”' })).toBeDefined()
  await pane.press({ key: 'again' })
  await settle()
  expect(forks[1]).toBe(forks[0])
  expect(fills).toHaveLength(1)

  // No selection, a request: the whole session, with the request.
  selected = undefined
  draft = 'in one paragraph'
  await band.press({ key: 'how' })
  await settle()
  expect(forks[2]).toContain('to what we are doing in this session')
  expect(forks[2]).toContain('> in one paragraph')
})

test('a selection does not expire while a request is being typed', async ($, on) => {
  const time = mock.clock(on)
  on('ui.selection', () => ({ value: { text: 'one' } }))
  let draft = ''
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  engineBand(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount(BAND)
  const badge = async () =>
    (await band.findAll({ type: 'Text' })).map(t => t.text?.trim()).find(t => t?.startsWith('↳'))

  await time.advance(500)
  draft = 'explain it in'
  await time.advance(15000)
  expect(await badge()).toBe('↳ “one”')
  draft = ''
  await time.advance(500)
  expect(await badge()).toBeUndefined()
})

test('the pane counts the seconds while the fork runs, then shows the tokens', async ($, on) => {
  const time = mock.clock(on)
  noSelection(on)
  emptyPrompt(on)
  on('fs.read', () => ({ value: SKILL }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('model.fork', async () => {
    await time.sleep(3000)
    return { value: { isAnswered: true as const, text: 'Done.', usage: { ...USAGE, output_tokens: 820 } } }
  })
  engineBand(on)
  const band = await $.ui.mount(BAND)

  const pressed = band.press({ key: 'why' })
  await time.advance(2000)
  const pane = await $.ui.mount(PANE_TARGET)
  expect(await pane.find({ type: 'Text', text: /Thinking… 2s/ })).toBeDefined()
  await time.advance(1000)
  await pressed
  expect(await pane.find({ type: 'Text', text: '3s · 820 tokens' })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /Thinking/ })).toBeUndefined()
})
