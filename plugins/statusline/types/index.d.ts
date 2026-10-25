// Where the session works, as git reports it.
export type Repo = {
  // The top folder; for a linked worktree, the main checkout's.
  name: string
  // The linked worktree's folder, when the session works in one.
  worktree?: string
  // The path under the top folder the session works in.
  sub?: string
  // `@<sha>` when HEAD is detached.
  branch: string
  // Ahead/behind its upstream as of the last fetch; absent without an upstream.
  sync?: { ahead: number; behind: number }
  changes: { staged: number; modified: number; untracked: number }
}

export type Pr = {
  number: number
  url: string
  review?: 'approved' | 'changes_requested'
  isDraft: boolean
}

export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Line = {
  model: string
  effort?: string
  ultracode: boolean
  cwd: string
  repo: Repo | null
  pr: Pr | null
  // The last response's input tokens and the % of the window they take.
  context: { tokens: number; percent: number }
  limits: Limit[]
}

declare module 'claude-code' {
  interface PluginState {
    statusline: { line: Line | null; turn: number }
  }
}
