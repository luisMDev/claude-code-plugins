// The graph as a drawing, for the surfaces that draw an Svg (desktop, VS Code,
// mobile): lanes laid out from each commit's parents, as Git Graph draws them.

import type { Ref, Row } from '../types'

export const LANES = ['#83a598', '#d3869b', '#fabd2f', '#8ec07c', '#fe8019', '#b8bb26', '#fb4934']
export const REF_COLOR: Record<Ref['kind'], string> = {
  head: '#b8bb26',
  local: '#d3869b',
  remote: '#83a598',
  tag: '#fabd2f',
}

type Commit = NonNullable<Row['commit']>

// A line from one row's lane to the next row's: straight down or curving across.
export type Segment = { row: number; from: number; to: number; lane: number }
export type Layout = { cols: number[]; segments: Segment[]; width: number }

const freeLane = (lanes: (string | null)[]) => {
  const free = lanes.indexOf(null)
  return free < 0 ? lanes.push(null) - 1 : free
}

/**
 * Each commit's lane, and the lines between rows. A lane holds the commit it
 * waits for: a commit takes the first lane waiting for it (others waiting end
 * there), hands its lane to its first parent, and opens or joins one for each
 * other parent. Commits come children first, as `git log --graph` orders them.
 */
export function layout(commits: readonly Commit[]): Layout {
  const lanes: (string | null)[] = []
  const cols: number[] = []
  const segments: Segment[] = []
  let width = 0

  commits.forEach((c, i) => {
    let col = lanes.indexOf(c.full)
    if (col < 0) col = freeLane(lanes)
    lanes.forEach((h, k) => {
      if (h === c.full && k !== col) lanes[k] = null
    })
    cols.push(col)

    const [first, ...others] = c.parents
    lanes[col] = first ?? null
    // Lanes this commit opens start at its dot, not straight above.
    const opened = new Set<number>()
    const joins: number[] = []
    for (const p of others) {
      const j = lanes.indexOf(p)
      if (j >= 0) {
        joins.push(j)
      } else {
        const k = freeLane(lanes)
        lanes[k] = p
        opened.add(k)
      }
    }
    width = Math.max(width, lanes.length)

    const next = commits[i + 1]
    const nextCol = next === undefined ? -1 : lanes.indexOf(next.full)
    const end = (k: number) => (next !== undefined && lanes[k] === next.full ? nextCol : k)
    lanes.forEach((h, k) => {
      if (h !== null) segments.push({ row: i, from: opened.has(k) ? col : k, to: end(k), lane: k })
    })
    for (const j of joins) segments.push({ row: i, from: col, to: end(j), lane: j })
  })

  return { cols, segments, width }
}

// A row's height in CSS pixels: above a line of text or a pill button, so the
// row is as tall as its slice of lanes and the slices meet without a gap.
export const ROW = 28
const LANE = 16
const PAD = 10
const DOT = 4.5

const STYLE =
  'svg{--bg:#282828}@media (prefers-color-scheme:light){svg{--bg:#fbf1c7}}line,path{fill:none;stroke-width:2}'

/** The lanes' width in CSS pixels, the same for every row so the slices line up. */
export const lanesWidth = (lay: Layout) => PAD * 2 + (Math.max(lay.width, 1) - 1) * LANE

/**
 * Row `i`'s slice of the lanes: the drawing of every row, cropped by the
 * viewBox to this one's height, so the lines it shares with the rows above and
 * below run on into their slices. `isCut` when older commits were left out.
 */
export function rowSvg(lay: Layout, isHead: boolean, i: number, rows: number, isCut: boolean) {
  const x = (lane: number) => PAD + lane * LANE
  const y = (row: number) => ROW / 2 + row * ROW
  const width = lanesWidth(lay)
  const out: string[] = []
  for (const s of lay.segments) {
    if (s.row !== i && s.row !== i - 1) continue
    const y1 = y(s.row)
    const y2 = s.row + 1 < rows ? y(s.row + 1) : isCut ? y1 + ROW : y1 + ROW / 2
    const color = LANES[s.lane % LANES.length]
    const [x1, x2] = [x(s.from), x(s.to)]
    out.push(
      x1 === x2
        ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}"/>`
        : `<path d="M${x1} ${y1}C${x1} ${y1 + ROW * 0.6} ${x2} ${y2 - ROW * 0.6} ${x2} ${y2}" stroke="${color}"/>`,
    )
  }
  const cx = x(lay.cols[i]!)
  const color = LANES[lay.cols[i]! % LANES.length]
  out.push(
    isHead
      ? `<circle cx="${cx}" cy="${y(i)}" r="${DOT + 1}" fill="var(--bg)" stroke="${color}" stroke-width="2.5"/>`
      : `<circle cx="${cx}" cy="${y(i)}" r="${DOT}" fill="${color}"/>`,
  )
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW}" viewBox="0 ${i * ROW} ${width} ${ROW}">` +
    `<style>${STYLE}</style>${out.join('')}</svg>`
  )
}
