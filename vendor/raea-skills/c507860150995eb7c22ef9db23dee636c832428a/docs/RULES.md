# The Rules

The non-negotiables for every skill in this library. `just check` enforces the
ones a machine can; reviewers enforce the rest.

## Why these rules exist

raea is **non-deterministic on purpose**. The same brief can produce two
different, valid edits. That's the feature. A skill that hard-codes one person's
taste turns every render into that person's edit.

So: **skills teach the tool and the craft floor. Taste stays with the person.**

## 1. Floor vs. taste

| Floor (goes in skills) | Taste (stays out) |
|---|---|
| Text inside platform safe areas | Which font |
| Loudness targets per platform | Which music feel |
| Captions in sync with speech | Caption style |
| No clipped text, no flashing hazards | Color palette |
| Cuts land on word boundaries | Cut rhythm / pace |
| Source frame rate respected | "Cinematic", "punchy", "clean" |

**The test:** *Would two great editors disagree about this?*
Yes → it's taste. Leave it out, or list it under "Choices to leave open".
No → it's floor. Write it down, and say how to check it.

## 2. Where taste lives instead

raea already has homes for taste. Skills point there; they never replace them:

- `taste.ts` — the person's look and feel
- `brief.ts` — what this project is for
- `raea brand DOMAIN` — a brand's colors, type, logos
- `raea guide NAME` — raea's own craft guides

A skill says *"read taste.ts for pace"*, never *"cut every 2 seconds"*.

## 3. Describe choices, don't make them

Bad: "Use a 0.5s crossfade."
Good: "Transition length is a choice: shorter reads as energetic, longer as
calm. Take it from taste.ts, or ask."

## 4. Leave randomness alone

- Never pin a `--seed` in a skill's instructions unless the step is about
  reproducing a specific render.
- Never tell the agent to pick "the first" or "the safest" option every time.
- Offer ranges and trade-offs, not single values.

## 5. Every skill tracks raea

- `metadata.raea-tested-against` = the raea version you last tested with.
- `metadata.raea-verbs` = every `raea` command the skill uses.
- After raea updates: `just drift`, re-test the stale skills, bump the version.

## 6. Escape hatch

Sometimes a "must" is a real spec (a platform rule, a legal requirement). Mark
the line so the opinion check skips it, and say why:

```markdown
Keep text inside the safe area. <!-- opinion-ok: platform spec, not taste -->
```

A reviewer must agree with the reason.

## 7. Your expertise goes here

The creative-director knowledge is the most valuable input. Point it at:

- **Gotchas** — what goes wrong in real edits
- **Checks** — how a pro spots a bad cut, bad sync, bad mix
- **Vocabulary** — the right words for things (via montology)
- **Choices** — the decisions that matter, and their trade-offs

Not at: what the result should look like.
