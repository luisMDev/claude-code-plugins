---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: 'What will the next session be used for?'
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to a path produced by `mktemp -t handoff-XXXXXX.md` (read the file before you write to it).

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

Be brief and concise, but include all relevant context, decisions made, and any pending actions. Use bullet points or numbered lists for clarity. Include any important links, references, or resources that the next agent may need to continue the work effectively.
