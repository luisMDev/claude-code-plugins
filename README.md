# claude-code-plugins

LuismDev's Claude Code plugins, published as one marketplace.

| Plugin | What it does |
| -- | -- |
| [`how-why-teach`](plugins/how-why-teach) | A band above the prompt with three buttons. **How** explains how the current work is done, **Why** explains why it is done this way (pros, cons, alternatives, how to do it better), **Teach** walks you through it like a teacher. Each button asks Claude to use the matching skill (`how-why-teach:how`, `:why`, `:teach`), which you can also invoke by name. |

## Install

At the prompt of a terminal session:

```
/plugin install how-why-teach --marketplace luisMDev/claude-code-plugins
```

Answer `y` to add the marketplace, then pick a scope (user scope is first; press Enter).

From a shell:

```
claude plugin install how-why-teach --marketplace luisMDev/claude-code-plugins
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `luisMDev/claude-code-plugins`, then Add plugin.

## Develop

```
claude --plugin-dir plugins/how-why-teach   # run a session with the plugin loaded from disk
claude plugin validate plugins/how-why-teach
claude plugin test plugins/how-why-teach
```
