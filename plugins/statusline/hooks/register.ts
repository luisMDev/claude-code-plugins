import type { Register } from 'claude-code'

// The status line is a settings key, not something a mod draws: answering it in
// the merged settings makes Claude Code run the plugin's own script, so the
// capsules keep their ANSI colours, Nerd Font caps and OSC 8 links. It wins over
// a statusLine of the person's own while the plugin is enabled. `bash` runs it
// because an installed copy of the plugin may lose the script's exec bit.
export const register: Register = on => {
  on('settings.read', async ($, e, next) => {
    const read = await next(e)
    // A read of one source is that file as loaded; only the merge gets the line.
    if (e.source !== undefined || read.value === undefined) {
      return read
    }
    const statusLine = { type: 'command' as const, command: `bash "${$.plugin.root}/statusline.sh"` }
    return { value: { ...read.value, statusLine } }
  }).catch(($, e, next) => next(e))
}
