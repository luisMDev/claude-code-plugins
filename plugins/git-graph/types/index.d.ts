// A name `git log --decorate` puts beside a commit, by what it names.
export type Ref = { name: string; kind: 'head' | 'local' | 'remote' | 'tag' }

// One row of `git log --graph`: the graph's columns, and the commit when the row has one.
export type Row = {
  graph: string
  // `full` and `parents` are whole hashes, which the drawn graph lays its lanes out by.
  commit?: { hash: string; full: string; parents: string[]; refs: Ref[]; subject: string; author: string; age: string }
}

export type Branch = {
  name: string
  hash: string
  isHead: boolean
  // Its upstream and how far apart they are; absent without one.
  upstream?: string
  ahead: number
  behind: number
  // The upstream was deleted on the remote.
  isGone: boolean
}

export type Graph = {
  status: 'loading' | 'done' | 'error'
  error?: string
  // Every branch's history, or the checked-out branch's alone.
  isAll: boolean
  rows: Row[]
  local: Branch[]
  remote: { name: string; hash: string }[]
  // The branch lists shown above the graph, or folded away.
  isBranchesOpen: boolean
  // The name pressed, by its place in the pane (`local-0`, `ref-3-1`), which
  // shows a copy button beside it; and the place of the one just copied.
  picked: { id: string; name: string } | null
  copied: string | null
  // The commits read at most; Load more raises it.
  limit: number
  // When it was read, for the pane's "read at 14:02:11".
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'git-graph': { graph: Graph | null }
  }
}
