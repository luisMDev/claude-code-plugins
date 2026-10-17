import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { PANE, sessionPrompt } from './register'

declare function setTimeout(callback: () => void, ms: number): unknown

const BAND = {
  plugin: 'handoff',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const PANE_TARGET = {
  plugin: 'handoff',
  surface: 'terminal',
  component: 'Pane',
  requestId: PANE,
  props: { title: 'Handoff', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const SKILL = '---\nname: handoff\ndescription: Compact it.\n---\n\nWrite a handoff document.\n'
const DOC = '# Handoff\n\n- Pending: push.'
const PATH = '/tmp/handoff-abc123.md'

// What the engine draws beneath the plugins' bands: here a line of its own.
function engineBand(on: On, text = 'engine band') {
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, text) as ReturnType<typeof Text>
  })
}

// A session whose fork writes DOC, in a clock that moves 4 s on each read.
function session(on: On) {
  let now = 0
  const forks: string[] = []
  on('clock.now', () => ({ value: (now += 4000) }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('fs.read', () => ({ value: SKILL }))
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true as const, text: DOC, usage: USAGE } }
  })
  engineBand(on)
  return forks
}

const run = (stdout: string, exitCode = 0, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))

test('Handoff writes the document in the pane from a fork of the session', async ($, on) => {
  const forks = session(on)
  const band = await $.ui.mount(BAND)

  await band.press({ key: 'handoff' })
  await settle()

  expect(forks).toHaveLength(1)
  expect(forks[0]).toContain('Write a handoff document.')
  expect(forks[0]).toContain('You cannot call tools here')
  expect(forks[0]).not.toContain('description:')
  const pane = await $.ui.mount(PANE_TARGET)
  expect((await pane.find({ key: 'doc' }))?.text).toContain('Pending: push.')
  expect((await pane.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['again', 'copy', 'session', 'close'])
})

test('New session saves the handoff with mktemp and starts claude --bg on it', async ($, on) => {
  session(on)
  const runs: { argv: readonly string[]; cwd?: string }[] = []
  const writes: { path: string; text: string }[] = []
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, cwd: e.init?.cwd })
    return e.argv[0] === 'mktemp' ? run(`${PATH}\n`) : run('Started background session 1a2b3c4d\n')
  })
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'handoff' })
  await settle()
  const pane = await $.ui.mount(PANE_TARGET)

  await pane.press({ key: 'session' })
  await settle()

  expect(runs[0]?.argv).toEqual(['mktemp', '-t', 'handoff-XXXXXX.md'])
  expect(writes).toEqual([{ path: PATH, text: DOC }])
  expect(runs[1]).toEqual({ argv: ['claude', '--bg', sessionPrompt(PATH)], cwd: '/work/repo' })
  expect(await pane.find({ type: 'Text', text: /Session 1a2b3c4d started/ })).toBeDefined()
  expect((await pane.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['again', 'copy', 'attach', 'close'])
})

test('a session that does not start says why and keeps the button', async ($, on) => {
  session(on)
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('process.run', (_, e) => (e.argv[0] === 'mktemp' ? run(`${PATH}\n`) : run('', 1, 'not logged in')))
  on('fs.write', () => ({ value: undefined }))
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'handoff' })
  await settle()
  const pane = await $.ui.mount(PANE_TARGET)

  await pane.press({ key: 'session' })
  await settle()

  expect(await pane.find({ type: 'Text', text: /not logged in/ })).toBeDefined()
  expect((await pane.findAll({ type: 'Button' })).map(b => b.key)).toEqual(['again', 'copy', 'session', 'close'])
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
  expect(at(' Handoff ')).toBeGreaterThanOrEqual(0)
  expect(at(' Handoff ')).toBeLessThan(at('·'))
  expect(at('·')).toBeLessThan(at('Other mod'))
  expect(at('Other mod')).toBeLessThan(at('engine notice'))
})
