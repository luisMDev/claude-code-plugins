import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { parseLog, parseRefList, parseRefs } from './git'
import { PANE } from './register'
import { layout } from './svg'

const BAND = {
  plugin: 'git-graph',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 120, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const PANE_TARGET = {
  plugin: 'git-graph',
  surface: 'terminal',
  component: 'Pane',
  requestId: PANE,
  props: { title: 'Git Graph', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const S = '\x1f'
// main, one commit ahead of origin/main, merged a feature branch.
const LOG = [
  `*   ${S}c3${S}a1 b2${S}c3c3c3c${S}HEAD -> main, tag: v1.0${S}Merge feat/x${S}Ana${S}2 hours ago`,
  `|\\  `,
  `| * ${S}b2${S}a1${S}b2b2b2b${S}feat/x, origin/feat/x${S}Add x${S}Ana${S}3 hours ago`,
  `|/  `,
  `* ${S}a1${S}${S}a1a1a1a${S}origin/main${S}First commit${S}Ana${S}2 days ago`,
  '',
].join('\n')
const REFS = [
  `*${S}refs/heads/main${S}c3c3c3c${S}origin/main${S}ahead 1`,
  ` ${S}refs/heads/feat/x${S}b2b2b2b${S}origin/feat/x${S}`,
  ` ${S}refs/heads/old${S}a1a1a1a${S}origin/old${S}gone`,
  ` ${S}refs/remotes/origin/HEAD${S}a1a1a1a${S}${S}`,
  ` ${S}refs/remotes/origin/main${S}a1a1a1a${S}${S}`,
  ` ${S}refs/remotes/origin/feat/x${S}b2b2b2b${S}${S}`,
  '',
].join('\n')

const ran = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

function repo(on: On, { inRepo = true, log = LOG } = {}) {
  const runs: string[][] = []
  // What the engine draws beneath the plugins' band: here a line of its own.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, null, 'engine band') as ReturnType<typeof Text>
  })
  mock.clock(on, { now: Date.parse('2026-10-26T14:02:11') })
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    if (!inRepo) return ran('', 128)
    if (e.argv.includes('remote')) return ran('origin\n')
    if (e.argv.includes('for-each-ref')) return ran(REFS)
    return ran(log)
  })
  return runs
}

test('decorations are told apart: HEAD, local, remote and tag', () => {
  expect(parseRefs('HEAD -> main, origin/main, tag: v1, feat/x', ['origin'])).toEqual([
    { name: 'HEAD', kind: 'head' },
    { name: 'main', kind: 'local' },
    { name: 'origin/main', kind: 'remote' },
    { name: 'v1', kind: 'tag' },
    { name: 'feat/x', kind: 'local' },
  ])
})

test('the log keeps the graph of every row and the commit of commit rows', () => {
  const rows = parseLog(LOG, ['origin'])
  expect(rows.map(r => r.graph)).toEqual(['*', '|\\', '| *', '|/', '*'])
  expect(rows[2]?.commit).toEqual({
    hash: 'b2b2b2b',
    full: 'b2',
    parents: ['a1'],
    refs: [
      { name: 'feat/x', kind: 'local' },
      { name: 'origin/feat/x', kind: 'remote' },
    ],
    subject: 'Add x',
    author: 'Ana',
    age: '3 hours ago',
  })
  expect(rows[1]?.commit).toBeUndefined()
})

test('branches carry their upstream and how far apart; a remote HEAD is left out', () => {
  const { local, remote } = parseRefList(REFS)
  expect(local).toEqual([
    { name: 'main', hash: 'c3c3c3c', isHead: true, upstream: 'origin/main', ahead: 1, behind: 0, isGone: false },
    { name: 'feat/x', hash: 'b2b2b2b', isHead: false, upstream: 'origin/feat/x', ahead: 0, behind: 0, isGone: false },
    { name: 'old', hash: 'a1a1a1a', isHead: false, upstream: 'origin/old', ahead: 0, behind: 0, isGone: true },
  ])
  expect(remote.map(r => r.name)).toEqual(['origin/main', 'origin/feat/x'])
})

test('Graph opens the pane with the branches and the graph, on terminal and desktop', async ($, on) => {
  repo(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'git-graph' })
    const pane = await $.ui.mount({ ...PANE_TARGET, surface })
    // Each opening starts with the lists folded and every branch shown.
    expect((await pane.find({ type: 'Box' }))?.text).not.toContain('Local')
    await pane.press({ key: 'branches' })
    if (surface === 'desktop') {
      expect((await pane.find({ type: 'Button', key: 'scope-all' }))?.props.variant).toBe('primary')
      expect((await pane.find({ type: 'Button', key: 'scope-current' }))?.props.variant).toBe('secondary')
    }

    const text = (await pane.find({ type: 'Box' }))?.text ?? ''
    expect(text).toContain('⎇ main · 3 local · 2 remote')
    expect(text).toContain('origin/main ↑1')
    expect(text).toContain('a1a1a1a → origin/old gone')
    expect(text.includes('')).toBe(surface === 'terminal')

    // The terminal draws git's own graph as text; the desktop, a row per commit with its slice of the lanes.
    const svgs = await pane.findAll({ type: 'Svg' })
    if (surface === 'terminal') {
      expect(text).toContain('c3c3c3c HEAD → main ◆ v1.0 Merge feat/x')
      expect(text).toContain('●')
      expect(svgs).toHaveLength(0)
    } else {
      expect(text).not.toContain('|/')
      expect(svgs).toHaveLength(3)
      // Each branch and tag a button of its own.
      expect(text).toContain('main◆ v1.0Merge feat/xAna · 2 hours agoc3c3c3c')
      // Each slice shows its own row: the viewBox steps down a row at a time.
      expect(svgs.map(s => /viewBox="0 (\d+)/.exec(String(s.props.source))?.[1])).toEqual(['0', '28', '56'])
      expect(svgs.every(s => s.props.height === 28)).toBe(true)
    }
  }
})

test('lanes: a merge opens a lane for its second parent, which closes into the first', () => {
  const commit = (full: string, parents: string[]) => ({ hash: full, full, parents, refs: [], subject: '', author: '', age: '' })
  const { cols, segments, width } = layout([commit('c3', ['a1', 'b2']), commit('b2', ['a1']), commit('a1', [])])

  expect(cols).toEqual([0, 1, 0])
  expect(width).toBe(2)
  expect(segments).toEqual([
    { row: 0, from: 0, to: 0, lane: 0 },
    { row: 0, from: 0, to: 1, lane: 1 },
    { row: 1, from: 0, to: 0, lane: 0 },
    { row: 1, from: 1, to: 0, lane: 1 },
  ])
})

test('Current branch reads the log without --all; the lists start folded and Branches opens them', async ($, on) => {
  const runs = repo(on)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'git-graph' })
  const pane = await $.ui.mount(PANE_TARGET)
  expect(runs.some(argv => argv.includes('log') && argv.includes('--all'))).toBe(true)

  await pane.press({ key: 'scope-current' })
  const logs = runs.filter(argv => argv.includes('log'))
  expect(logs.at(-1)?.includes('--all')).toBe(false)
  expect((await pane.find({ type: 'Box' }))?.text).toContain('Current branch')

  expect((await pane.find({ type: 'Box' }))?.text).not.toContain('Local')
  await pane.press({ key: 'branches' })
  expect((await pane.find({ type: 'Box' }))?.text).toContain('Local')
})

test('outside a repository the pane says so', async ($, on) => {
  repo(on, { inRepo: false })
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'git-graph' })
  const pane = await $.ui.mount(PANE_TARGET)

  expect(await pane.find({ type: 'Text', text: /Not a git repository/ })).toBeDefined()
})

test('copying a name: pressed then copied on the terminal, a name or hash pressed copies it on desktop', async ($, on) => {
  repo(on)
  const copies: { text: string; surface?: string }[] = []
  on('ui.copy', (_, e) => {
    copies.push({ text: e.text, surface: e.surface })
    return { value: { isCopied: true as const } }
  })

  // The terminal: the name is a button that shows a copy button beside it.
  {
    const band = await $.ui.mount(BAND)
    await band.press({ key: 'git-graph' })
    const pane = await $.ui.mount(PANE_TARGET)
    const copyButtons = async () => (await pane.findAll({ type: 'Button' })).filter(b => b.key?.startsWith('copy-'))
    expect(await copyButtons()).toHaveLength(0)

    await pane.press({ key: 'branches' })
    await pane.press({ key: 'name-remote-1' })
    expect((await pane.find({ type: 'Button', key: 'copy-remote-1' }))?.text).toContain('Copy name')
    await pane.press({ key: 'copy-remote-1' })
    expect(copies.at(-1)).toEqual({ text: 'origin/feat/x', surface: 'terminal' })
    expect((await pane.find({ type: 'Button', key: 'copy-remote-1' }))?.text).toContain('Copied')

    // Pressed again, the name puts the button away.
    await pane.press({ key: 'name-remote-1' })
    expect(await copyButtons()).toHaveLength(0)
  }

  // The desktop: each name a button that copies it, and each commit's hash.
  {
    const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await band.press({ key: 'git-graph' })
    const pane = await $.ui.mount({ ...PANE_TARGET, surface: 'desktop' })

    // The second row's remote branch, in the tree.
    await pane.press({ key: 'copy-ref-1-1' })
    expect(copies.at(-1)).toEqual({ text: 'origin/feat/x', surface: 'desktop' })
    expect((await pane.find({ type: 'Button', key: 'copy-ref-1-1' }))?.text).toBe('origin/feat/x ✓')

    // The first commit's hash, copied whole.
    await pane.press({ key: 'hash-0' })
    expect(copies.at(-1)).toEqual({ text: 'c3', surface: 'desktop' })
    expect((await pane.find({ type: 'Button', key: 'hash-0' }))?.text).toBe('c3c3c3c ✓')
    expect((await pane.find({ type: 'Button', key: 'copy-ref-1-1' }))?.text).toBe('origin/feat/x')
  }
})

test('a full page of commits ends in Load more, which reads the next page too', async ($, on) => {
  // 300 commits in a line, each the parent of the one above.
  const log = Array.from({ length: 300 }, (_, i) => `* ${S}h${i}${S}h${i + 1}${S}h${i}${S}${S}Commit ${i}${S}Ana${S}1 day ago`).join('\n')
  const runs = repo(on, { log })

  const band = await $.ui.mount(BAND)
  await band.press({ key: 'git-graph' })
  const desktop = await $.ui.mount({ ...PANE_TARGET, surface: 'desktop' })
  expect((await desktop.find({ type: 'Button', key: 'more' }))?.text).toContain('Load 300 more')

  const pane = await $.ui.mount(PANE_TARGET)
  expect((await pane.find({ type: 'Button', key: 'more' }))?.text).toContain('Load 300 more')
  await pane.press({ key: 'more' })
  expect(runs.filter(argv => argv.includes('log')).at(-1)).toContain('-n600')
})

test('fewer commits than a page: no Load more', async ($, on) => {
  repo(on)
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'git-graph' })
  const pane = await $.ui.mount(PANE_TARGET)
  expect(await pane.find({ type: 'Button', key: 'more' })).toBeUndefined()
})
