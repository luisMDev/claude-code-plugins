---
name: how
description: Explain how the work in the current session is being done - the mechanism, the steps, the pieces involved and how they connect. Use when the user presses the How button or asks "how are we doing this", "how does this work", "cómo lo estamos haciendo".
---

# How

Explain **how** the work of this session is being done. The user wants the mechanism, not the motivation.

## Scope

Look back over the session: the request, the files read and changed, the commands run, the decisions taken. Pick the piece of work that is current (the last task, or the one still open). If the session holds several unrelated tasks, cover the current one and name the others in one line.

Do not run new tools unless a fact you need is missing from the session. Never change files.

When the person selected a passage of the session, that passage is the scope: cover it, with the rest of the session as context.

## What to cover

1. **The goal in one sentence**, so the reader knows what the "how" is for.
2. **The steps, in order.** What was done (or will be done), each step one or two sentences: what it does and what it produces for the next.
3. **The pieces involved.** Name each real component (file, function, service, command, API, data structure) with its path or identifier, and what role it plays. Use `path:line` references when they exist in the session.
4. **How the pieces connect.** The flow of data or control between them: who calls whom, what passes between them, when. A small ASCII diagram helps when there are three or more pieces.
5. **The non-obvious parts.** Anything a reader would not guess from the code: an ordering constraint, a side effect, a convention the code depends on, a workaround.
6. **How to verify it.** The command, test or check that shows it works.

## Style

- Answer in the language the user writes in.
- Concrete over abstract: real names, real paths, real commands.
- Short paragraphs, numbered steps, a table when comparing pieces.
- No motivation or trade-off discussion beyond one line; that is the `why` skill's job.
