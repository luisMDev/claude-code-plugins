// The page an answer is published as: the model writes <main>'s content,
// this shell carries the artifact contract (title, color tokens, dark mode).

export const ARTIFACT_DIR = '.claude/how-why-teach'

export const BODY_SYSTEM = `You turn a Markdown explanation into the inner HTML of a <main> element.
Output only that HTML: no <html>, <head>, <body>, <main>, <style> or <script>, no code fences.
Keep every fact and code snippet. Use semantic elements: h1 once (a short title), h2/h3, p, ul/ol,
table, pre><code, blockquote, and <aside class="note"> for a key takeaway. Inline SVG is allowed for a
small diagram, drawn with currentColor and var(--accent). No external URLs, images, fonts or scripts.`

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const stripFences = (html: string) =>
  html.trim().replace(/^```(?:html)?\n/, '').replace(/\n```$/, '')

export function page(title: string, accent: string, body: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
:root { --bg: #fbf1c7; --fg: #3c3836; --muted: #7c6f64; --line: #d5c4a1; --code: #f2e5bc; --accent: ${accent}; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #282828; --fg: #ebdbb2; --muted: #a89984; --line: #504945; --code: #32302f; }
}
:root[data-theme="dark"] { --bg: #282828; --fg: #ebdbb2; --muted: #a89984; --line: #504945; --code: #32302f; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.65 system-ui, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 48px 16px 64px; }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 1.5rem; border-bottom: 3px solid var(--accent); padding-bottom: .5rem; }
h2 { margin-top: 2.5rem; color: var(--accent); }
a { color: var(--accent); }
pre, code { font-family: ui-monospace, monospace; font-size: .9em; background: var(--code); border-radius: 6px; }
code { padding: .1em .35em; }
pre { padding: 1rem; overflow-x: auto; }
pre code { padding: 0; }
table { width: 100%; border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border-bottom: 1px solid var(--line); padding: .5rem .75rem; text-align: left; vertical-align: top; }
blockquote, aside.note { margin: 1.5rem 0; padding: .75rem 1rem; border-left: 4px solid var(--accent); background: var(--code); border-radius: 0 6px 6px 0; }
svg { max-width: 100%; height: auto; }
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`
}
