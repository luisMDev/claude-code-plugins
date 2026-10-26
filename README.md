# claude-code-plugins

LuismDev's Claude Code plugins, published as one marketplace. Site: https://luismdev.github.io/claude-code-plugins/

| Plugin | What it does |
| -- | -- |
| [`how-why-teach`](plugins/how-why-teach) | A band above the prompt with three buttons. **How** explains how the current work is done, **Why** explains why it is done this way (pros, cons, alternatives, how to do it better), **Teach** walks you through it like a teacher. Each button opens a side pane and answers there from a fork of the session (`$.model.fork`), with the matching skill's instructions as the question, so the main thread gets no extra turns. Select a passage of the transcript with the mouse before pressing (fullscreen terminal or desktop) and the answer covers that passage alone: the band notes the selection beside the buttons (`↳ 3 selected lines ✕`). Text typed in the prompt when you press a button goes along as a request ("explain it in Spanish"), with the selection or with the whole session, and leaves the prompt. A selection is spent once answered, dropped with its ✕, or dropped ten seconds after you made it while the prompt is empty. The engine keeps the last selection after a click takes the highlight down and tells mods nothing, so a click elsewhere leaves the badge until one of those; the pane quotes its first line, and **Again** asks about it again. From the pane, **Artifact** lays the answer out as a page (written to `.claude/how-why-teach/`, kept out of git through `.git/info/exclude`) and publishes it as a private claude.ai artifact after you approve the Artifact tool call. The skills (`how-why-teach:how`, `:why`, `:teach`) can also be invoked by name. |
| [`handoff`](plugins/handoff) | A **Handoff** button above the prompt. It writes a handoff of the session in a side pane from a fork (`$.model.fork`, the `handoff:handoff` skill as the question), so the main thread is untouched. Text typed in the prompt when you press it goes along as a request ("focus on the deploy") and leaves the prompt. **New session** saves it with `mktemp -t handoff-XXXXXX.md` and starts `claude --bg` on it; join with `claude attach <id>`. Both plugins' buttons share the row above the prompt. |
| [`statusline`](plugins/statusline) | Capsules at the bottom right of the prompt footer: the model and an effort bar (with `✦ ultracode` when it is on); where the session works (`⌂ repo`, or `repo ↳ wt:<name>` in a linked worktree), the branch, ahead/behind its upstream, staged/modified/untracked counts and the open PR as a link with its review state; the 5-hour and weekly usage windows in turn, every 10 seconds (`week ━━━━━───── 50% · 3d 0h`); and the context window in thousands of tokens with the % left (`244k ━━──────── (76%)`). The mod draws on `ui.render` for `SessionMode`, beside the engine's mode labels, and reads the repo with `git` on each turn and every tick, and the PR with `gh` when the branch changes or every five minutes (no `gh`, no PR). It replaces nothing: remove a `statusLine` of yours, or another plugin drawing the usage there, so the footer does not show both. The capsules' rounded ends need a Nerd Font; the desktop app draws them square. |

## Install

The site's **Copy install prompt** button copies a prompt to paste into Claude Code: it adds the marketplace, installs the plugins, checks the tools the status line script runs and offers to install the missing ones.

At the prompt of a terminal session:

```
/plugin install how-why-teach --marketplace luisMDev/claude-code-plugins
/plugin install handoff --marketplace luisMDev/claude-code-plugins
/plugin install statusline --marketplace luisMDev/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; press Enter).

From a shell:

```
claude plugin install how-why-teach --marketplace luisMDev/claude-code-plugins
claude plugin install handoff --marketplace luisMDev/claude-code-plugins
claude plugin install statusline --marketplace luisMDev/claude-code-plugins
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `luisMDev/claude-code-plugins`, then Add plugin. Both plugins run there too: the desktop draws its own buttons, so the capsules lose the Nerd Font caps they have in the terminal. Handoff's New session needs the `claude` CLI on the PATH.

## Develop

```
claude --plugin-dir plugins/<plugin>   # run a session with the plugin loaded from disk
claude plugin validate plugins/<plugin>
claude plugin test plugins/<plugin>
```

## Site

`site/` is the plugins' landing page, an Astro static site. It reads `.claude-plugin/marketplace.json`, each `plugin.json` and each `SKILL.md` at build time; what the manifests do not say (hooks, what each mod draws, the demo's buttons, the commands a plugin's scripts need and the extra steps of its install prompt) is in `site/src/plugins.ts`. `.github/workflows/site.yml` publishes it to GitHub Pages on every push to `main`.

```
cd site
npm install
npm run dev     # http://localhost:4321/claude-code-plugins/
npm run build   # dist/
npm run check
```
