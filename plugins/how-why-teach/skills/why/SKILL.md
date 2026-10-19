---
name: why
description: Explain why the work in the current session is being done this way - the reasons, the pros and cons, the alternatives and how it could be done better. Use when the user presses the Why button or asks "why are we doing this", "why this way", "por qué lo hacemos así".
---

# Why

Explain **why** the work of this session is being done, and why **this way**. The user wants the reasoning behind the decisions, judged honestly.

## Scope

Look back over the session: the request, the constraints stated by the user or the project (CLAUDE.md, docs, existing code), what was tried, what was chosen. Focus on the current piece of work. Do not run new tools unless a fact you need is missing. Never change files.

When the person selected a passage of the session, that passage is the scope: cover it, with the rest of the session as context.

## What to cover

1. **The problem.** What need or bug the work answers, and what happens if it is not done.
2. **The decision.** The approach taken, in one or two sentences.
3. **Why this approach.** The concrete reasons: constraints from the user, from the codebase, from the platform; cost, time, risk. Say which reasons come from the user or the project and which were your own judgement.
4. **Pros.** What the approach gets right.
5. **Cons.** Its real costs and limits: what it does not handle, what it makes harder later, where it may break. If there are none worth naming, say so in one line; do not invent them.
6. **Alternatives.** The other reasonable ways to do it (two or three at most), each with why it was not chosen. A table works well: option, pro, con, verdict.
7. **How it could be better.** Improvements that are worth considering now or later, ranked by value. Be candid: if the chosen approach is not the best one, say so and say what you would recommend.

## Style

- Answer in the language the user writes in.
- Honest over reassuring. A decision made under a constraint can still be second-best; say it.
- Tie every claim to something in the session or the code; mark guesses as guesses.
- No step-by-step mechanics beyond what the reasoning needs; that is the `how` skill's job.
