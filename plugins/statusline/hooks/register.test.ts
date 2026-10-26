import type { Plugin } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

const MINE = { type: 'command', command: '~/.claude/scripts/statusline.sh' }

// The test's `$` has no settings noun, so an inline plugin reads them when the
// session starts, through the hook under test, and reports them as its status.
const READER: Plugin = {
  name: 'reader',
  register(on) {
    on('session.start', async ($, e, next) => {
      const merged = await $.settings.read()
      const user = await $.settings.read({ source: 'user' })
      $.ui.status(JSON.stringify({ merged, user }))
      return next(e)
    })
  },
}

test('the merge runs the plugin script as the status line; a source read stays as loaded', { plugins: [READER] }, async ($, on) => {
  let status = ''
  on('settings.read', () => ({ value: { statusLine: MINE, model: 'opus' } }))
  on('ui.status', (_, e) => {
    status = e.text ?? ''
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/work/repo', surface: 'terminal', isInteractive: true })

  const { merged, user } = JSON.parse(status)
  expect(merged.statusLine.type).toBe('command')
  expect(merged.statusLine.command).toMatch(/^bash ".+\/statusline\.sh"$/)
  expect(merged.statusLine.refreshInterval).toBe(10)
  expect(merged.model).toBe('opus')
  expect(user.statusLine).toEqual(MINE)
})
