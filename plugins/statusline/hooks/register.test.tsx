import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.parse('2026-10-25T12:00:00Z')
const MINUTE = 60_000
const at = (ms: number) => new Date(NOW + ms).toISOString()

const MODE = { plugin: 'statusline', component: 'SessionMode', props: { modes: [] } } as const
const DIRS = '/work/repo\n/work/repo/.git\n/work/repo/.git\n'
const STATUS = [
  '# branch.oid 1a2b3c4d5e6f',
  '# branch.head feat/bars',
  '# branch.upstream origin/feat/bars',
  '# branch.ab +1 -0',
  '1 M. N... 100644 100644 100644 a b src/staged.ts',
  '1 .M N... 100644 100644 100644 a b src/modified.ts',
  '? notes.md',
  '',
].join('\n')
const PR = JSON.stringify({ number: 7, url: 'https://github.com/o/r/pull/7', state: 'OPEN', reviewDecision: 'APPROVED', isDraft: false })

const ran = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

// A session in a repo one commit ahead, with a staged, a modified and an
// untracked file, an approved PR, and 244k tokens of a 1M window.
function session(on: On, { inRepo = true } = {}) {
  const clock = mock.clock(on, { now: NOW })
  const runs: string[][] = []
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('settings.read', () => ({ value: { effortLevel: 'xhigh' } }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { tokens: 244_000, window: 1_000_000, percent: 24 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 1, resetsAt: at(43 * MINUTE) },
        { kind: 'seven_day', percentUsed: 50, resetsAt: at(3 * 1440 * MINUTE + 10 * MINUTE) },
      ],
    },
  }))
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    if (e.argv[0] === 'gh') return ran(PR)
    if (!inRepo) return ran('', 128)
    return ran(e.argv.includes('rev-parse') ? DIRS : STATUS)
  })
  return { clock, runs }
}

async function drawn($: Engine, surface: 'terminal' | 'desktop' = 'terminal') {
  const ui = await $.ui.mount({ ...MODE, surface })
  return (await ui.find({ type: 'Box' }))?.text ?? ''
}

test('the capsules draw at the bottom right: model, repo, PR, usage, context', async ($, on) => {
  const { clock } = session(on)
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const text = await drawn($)

  expect(text).toContain('Opus 5.5 ━━━━─')
  expect(text).toContain('⌂ repo ⎇ feat/bars ↑1 +1 ~1 ?1 PR #7 ✓')
  expect(text).toContain('5h ────────── 1% · 43m')
  expect(text).toContain('244k ━━──────── (76%)')
})

test('the usage capsule turns to the weekly window on the next tick', async ($, on) => {
  const { clock } = session(on)
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()

  await clock.advance(10_000)

  expect(await drawn($)).toContain('week ━━━━━───── 50% · 3d 0h')
})

test('outside a repository: the folder, and no gh call', async ($, on) => {
  const { clock, runs } = session(on, { inRepo: false })
  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const text = await drawn($)

  expect(text).toContain('/work/repo')
  expect(text).not.toContain('⎇')
  expect(runs.some(argv => argv[0] === 'gh')).toBe(false)
})

test('the rounded caps are the terminal’s alone', async ($, on) => {
  const { clock } = session(on)
  await $.session.start({ cwd: '/work/repo', surface: 'desktop', isInteractive: true })
  await clock.settle()

  expect(await drawn($, 'terminal')).toContain('')
  expect(await drawn($, 'desktop')).not.toContain('')
})
