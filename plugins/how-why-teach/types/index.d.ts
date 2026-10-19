export type Answer = {
  mode: 'how' | 'why' | 'teach'
  status: 'loading' | 'done' | 'error'
  text: string
  seconds?: number
  // Tokens the answer took to write, once it is done.
  tokens?: number
  // The passage the person had selected when they pressed the button; Again asks about it again.
  selection?: string
  // What the person had typed in the prompt when they pressed it, sent along as their request.
  request?: string
  // The answer published as an artifact: its URL once done, the reason on an error.
  artifact?: { status: 'publishing' | 'done' | 'error'; text: string }
}

declare module 'claude-code' {
  interface PluginState {
    // selected: what the person has selected on screen, as the band last saw it.
    'how-why-teach': { answer: Answer | null; selected: string | null }
  }
}
