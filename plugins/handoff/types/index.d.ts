export type Handoff = {
  status: 'loading' | 'done' | 'error'
  text: string
  seconds?: number
  // The session started from it: its id and the file it reads, or why it did not start.
  session?: { status: 'starting' | 'done' | 'error'; text: string; path?: string }
}

declare module 'claude-code' {
  interface PluginState {
    handoff: { handoff: Handoff | null }
  }
}
