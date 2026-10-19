export type Answer = {
  mode: 'how' | 'why' | 'teach'
  status: 'loading' | 'done' | 'error'
  text: string
  seconds?: number
  // The passage the person had selected when they pressed the button; Again asks about it again.
  selection?: string
  // The answer published as an artifact: its URL once done, the reason on an error.
  artifact?: { status: 'publishing' | 'done' | 'error'; text: string }
}

declare module 'claude-code' {
  interface PluginState {
    'how-why-teach': { answer: Answer | null }
  }
}
