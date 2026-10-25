import type { EngineInterface } from 'claude-code'

import type { Pr, Repo } from '../types'

const base = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path
const parent = (path: string) => path.slice(0, path.lastIndexOf('/'))

// Optional locks off, so a read on every tick never holds up a commit.
function git($: EngineInterface, cwd: string, args: string[]) {
  return $.process.run(['git', '-C', cwd, '--no-optional-locks', ...args])
}

/** The repo pill's facts, from two git calls; null outside a repository. */
export async function readRepo($: EngineInterface, cwd: string): Promise<Repo | null> {
  const [dirs, status] = await Promise.all([
    git($, cwd, ['rev-parse', '--path-format=absolute', '--show-toplevel', '--absolute-git-dir', '--git-common-dir']),
    git($, cwd, ['status', '--porcelain=v2', '--branch']),
  ])
  if (dirs.exitCode !== 0 || status.exitCode !== 0) {
    return null
  }
  const [top = cwd, gitDir, common = gitDir] = dirs.stdout.trim().split('\n')
  const isWorktree = gitDir !== common
  const sub = cwd.startsWith(`${top}/`) ? cwd.slice(top.length) : undefined

  let branch = ''
  let sync: Repo['sync']
  const changes = { staged: 0, modified: 0, untracked: 0 }
  // Headers first (`# branch.oid`, `.head`, `.ab +1 -0`), then one row per path.
  for (const row of status.stdout.split('\n')) {
    const [kind, a, b, c] = row.split(' ')
    if (kind === '#' && a === 'branch.oid') branch = `@${b?.slice(0, 7)}`
    else if (kind === '#' && a === 'branch.head' && b !== '(detached)') branch = b ?? branch
    else if (kind === '#' && a === 'branch.ab') sync = { ahead: Number(b), behind: -Number(c) }
    else if (kind === '?') changes.untracked++
    else if (kind === '1' || kind === '2' || kind === 'u') {
      if (a?.[0] !== '.') changes.staged++
      if (a?.[1] !== '.') changes.modified++
    }
  }
  return {
    name: base(isWorktree ? parent(common ?? top) : top),
    ...(isWorktree ? { worktree: base(top) } : {}),
    ...(sub ? { sub } : {}),
    branch,
    ...(sync ? { sync } : {}),
    changes,
  }
}

/** The open PR of the branch, through gh; null without one, or without gh. */
export async function readPr($: EngineInterface, cwd: string): Promise<Pr | null> {
  try {
    const run = await $.process.run(['gh', 'pr', 'view', '--json', 'number,url,state,reviewDecision,isDraft'], {
      cwd,
      timeoutMs: 15_000,
    })
    const pr = run.exitCode === 0 ? JSON.parse(run.stdout) : null
    if (pr?.state !== 'OPEN') {
      return null
    }
    const review =
      pr.reviewDecision === 'APPROVED'
        ? 'approved'
        : pr.reviewDecision === 'CHANGES_REQUESTED'
          ? 'changes_requested'
          : undefined
    return { number: pr.number, url: pr.url, isDraft: pr.isDraft === true, ...(review ? { review } : {}) }
  } catch {
    // gh not installed: the command cannot start.
    return null
  }
}
