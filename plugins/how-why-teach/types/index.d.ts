export type Answer = {
  mode: 'how' | 'why' | 'teach'
  status: 'loading' | 'done' | 'error'
  text: string
  seconds?: number
}

declare module 'claude-code' {
  interface PluginState {
    'how-why-teach': { answer: Answer | null }
  }
}
