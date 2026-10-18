// The plugins as the marketplace lists them, read from the repo at build time,
// so a version bump or a new skill reaches the site with no edit here.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface Manifest {
  name: string
  version: string
  description: string
}

// `astro build` and `astro dev` run from site/; the repo is its parent.
const ROOT = resolve(process.cwd(), '..')
const readJson = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'))
const marketplace: { name: string; plugins: { name: string; source: string }[] } = readJson(
  '.claude-plugin/marketplace.json',
)

export const TITLE = 'luismdev marketplace' // the site's name; the marketplace's id stays MARKETPLACE
export const REPO = 'luisMDev/claude-code-plugins'
export const MARKETPLACE = marketplace.name

export interface Button {
  label: string
  color: string
  subtitle: string
  answer: string[]
}

export interface Skill {
  name: string
  description: string
}

export interface Plugin extends Manifest {
  hooks: string[]
  draws: string
  buttons: Button[]
  skills: Skill[]
}

// What the manifests do not say: what each mod hooks and draws, and its buttons
// as the band shows them (colors from each plugin's hooks/register.tsx).
const EXTRAS: Record<string, Pick<Plugin, 'hooks' | 'draws' | 'buttons'>> = {
  'how-why-teach': {
    hooks: ['ui.render'],
    draws: 'A band above the prompt and a pane beside the transcript',
    buttons: [
      {
        label: 'How',
        color: '#87afaf',
        subtitle: "How it's done",
        answer: [
          '## Goal',
          'Serve the plugins page from site/ on GitHub Pages.',
          '## Steps',
          '1. Read marketplace.json and each plugin.json',
          '2. Render one block per plugin',
          '3. Build with astro build, deploy from CI',
        ],
      },
      {
        label: 'Why',
        color: '#ffaf00',
        subtitle: 'Why this way',
        answer: [
          '## Why this approach',
          'The site reads the manifests, so it cannot drift.',
          '## Cons',
          'One more toolchain in the repo (Node, Astro).',
          '## Alternatives',
          'A hand-written index.html: no build, but copied data.',
        ],
      },
      {
        label: 'Teach',
        color: '#afaf00',
        subtitle: 'Lesson',
        answer: [
          '## Prerequisites',
          'A static site generator turns templates into plain HTML',
          'at build time; the browser gets no framework.',
          '## Check your understanding',
          '1. Where does the version on this page come from?',
        ],
      },
    ],
  },
  handoff: {
    hooks: ['ui.render'],
    draws: 'A button above the prompt and a pane beside the transcript',
    buttons: [
      {
        label: 'Handoff',
        color: '#d787af',
        subtitle: 'Next session',
        answer: [
          '## Where it stands',
          'The site builds; the deploy workflow is in place.',
          '## Pending',
          '- Enable GitHub Pages for the repo',
        ],
      },
    ],
  },
}

function frontmatter(md: string, key: string): string {
  const match = md.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : ''
}

export const plugins: Plugin[] = marketplace.plugins.map((entry) => {
  const manifest: Manifest = readJson(join(entry.source, '.claude-plugin/plugin.json'))
  const skillsDir = join(ROOT, entry.source, 'skills')
  const skills = existsSync(skillsDir)
    ? readdirSync(skillsDir).map((dir) => {
        const md = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8')
        return { name: frontmatter(md, 'name'), description: frontmatter(md, 'description') }
      })
    : []
  return { ...manifest, ...EXTRAS[entry.name], skills }
})
