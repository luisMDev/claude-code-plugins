export type Handoff = {
  status: 'loading' | 'done' | 'error'
  text: string
  seconds?: number
  // Tokens the document took to write, once it is done.
  tokens?: number
  // What the person had typed in the prompt when they pressed Handoff, sent along as their request.
  request?: string
  // The session started from it: its id and the file it reads, or why it did not start.
  session?: { status: 'starting' | 'done' | 'error'; text: string; path?: string }
}

declare module 'claude-code' {
  interface PluginState {
    handoff: { handoff: Handoff | null }
  }
}
