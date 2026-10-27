import type { EngineInterface } from 'claude-code'

import type { Branch, Ref, Row } from '../types'

// The commits read at first, and how many more each Load more reads: the pane
// scrolls, but git and the drawing stay quick.
export const PAGE = 300

const SEP = '\x1f'

// Optional locks off, so a read never holds up a commit.
function git($: EngineInterface, cwd: string, args: string[]) {
  return $.process.run(['git', '-C', cwd, '--no-optional-locks', ...args], { timeoutMs: 15_000 })
}

/** `git log --decorate`'s names: `HEAD -> main, origin/main, tag: v1`. */
export function parseRefs(decoration: string, remotes: readonly string[]): Ref[] {
  return decoration
    .split(', ')
    .filter(Boolean)
    .flatMap((name): Ref[] => {
      if (name.startsWith('HEAD -> ')) {
        return [{ name: 'HEAD', kind: 'head' }, { name: name.slice(8), kind: 'local' }]
      }
      if (name === 'HEAD') return [{ name, kind: 'head' }]
      if (name.startsWith('tag: ')) return [{ name: name.slice(5), kind: 'tag' }]
      return [{ name, kind: remotes.some(r => name.startsWith(`${r}/`)) ? 'remote' : 'local' }]
    })
}

/** `git log --graph` rows: a commit's after the graph and a separator; a joining row is graph alone. */
export function parseLog(stdout: string, remotes: readonly string[]): Row[] {
  return stdout
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const at = line.indexOf(SEP)
      if (at < 0) return { graph: line.trimEnd() }
      const [full = '', parents = '', hash = '', decoration = '', subject = '', author = '', age = ''] = line
        .slice(at + 1)
        .split(SEP)
      return {
        graph: line.slice(0, at).trimEnd(),
        commit: {
          hash,
          full,
          parents: parents.split(' ').filter(Boolean),
          refs: parseRefs(decoration, remotes),
          subject,
          author,
          age,
        },
      }
    })
}

/** `ahead 2, behind 1`, `ahead 3`, `gone` or nothing, as `%(upstream:track,nobracket)` says it. */
function parseTrack(track: string) {
  return {
    ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
    isGone: track === 'gone',
  }
}

/** `git for-each-ref` rows: the local branches, then the remote ones but each remote's HEAD. */
export function parseRefList(stdout: string) {
  const local: Branch[] = []
  const remote: { name: string; hash: string }[] = []
  for (const line of stdout.split('\n')) {
    const [head = '', ref = '', hash = '', upstream = '', track = ''] = line.split(SEP)
    if (ref.startsWith('refs/heads/')) {
      local.push({
        name: ref.slice(11),
        hash,
        isHead: head === '*',
        ...(upstream ? { upstream } : {}),
        ...parseTrack(track),
      })
    } else if (ref.startsWith('refs/remotes/') && !ref.endsWith('/HEAD')) {
      remote.push({ name: ref.slice(13), hash })
    }
  }
  return { local, remote }
}

/** The graph, the branches and the remotes; null outside a repository. */
export async function readGraph($: EngineInterface, cwd: string, isAll: boolean, limit = PAGE) {
  const [remotesRun, refsRun] = await Promise.all([
    git($, cwd, ['remote']),
    git($, cwd, [
      'for-each-ref',
      `--format=%(HEAD)${SEP}%(refname)${SEP}%(objectname:short)${SEP}%(upstream:short)${SEP}%(upstream:track,nobracket)`,
      'refs/heads',
      'refs/remotes',
    ]),
  ])
  if (remotesRun.exitCode !== 0 || refsRun.exitCode !== 0) {
    return null
  }
  const remotes = remotesRun.stdout.split('\n').filter(Boolean)
  const log = await git($, cwd, [
    'log',
    '--graph',
    '--date-order',
    '--color=never',
    `-n${limit}`,
    `--format=${SEP}%H${SEP}%P${SEP}%h${SEP}%D${SEP}%s${SEP}%an${SEP}%ar`,
    ...(isAll ? ['--all'] : []),
  ])
  // A repository with no commit yet has no log; its branches still read.
  const rows = log.exitCode === 0 ? parseLog(log.stdout, remotes) : []
  return { rows, ...parseRefList(refsRun.stdout) }
}
