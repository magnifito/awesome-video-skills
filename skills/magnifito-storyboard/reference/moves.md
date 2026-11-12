# Moves: distill and retime

How a review note maps to a named move: [`../../magnifito-video/reference/moves.md`](../../magnifito-video/reference/moves.md).
Both moves change `scene-plan.json` (scenes, `copy_text`, durations), so re-run validation after
them, and keep scene durations summing to `brief.duration_seconds`.

## distill

"Too long", "too much going on", "what's the point", "simplify". Fewer ideas, lines and parts.

- **Assess.** Put `brief.json` `objective` next to the plan. Mark every scene, line, layer and cue
  that does not serve it, and every repeat (two scenes making the same point, two sounds in one
  moment).
- **Decide.** The objective decides what stays; of two good things, keep the one that serves it
  better. Target length: the brief's, or the delivery's.
- **Change.** Cut whole things before trimming parts: a scene, a line, a layer. Merge repeats into
  the stronger one. Give the freed time to the moments that matter, so what is left breathes.
- **Verify.** After watching, say the piece in one sentence; it matches the objective. Length is
  within what was asked.
- **Goes wrong when** the proof or the payoff went (put it back, cut elsewhere), every scene got a
  little shorter and nothing was removed, or cuts land mid-word or mid-bar.

## retime

"It drags", "too fast", "rushed", "hold that longer", "dead air". How long each moment holds and
where the piece breathes.

- **Assess.** Mark where attention drops (the same picture for 3 s with nothing new; `validate`
  reports `freeze`) and where it cannot keep up (text gone before it is read, a cut before the
  result lands). With music, compare holds and cuts with the beat grid.
- **Decide.** Target length. The one or two holds that earn their time.
- **Change.** Fix it in `duration_seconds` first: shorten the drags, lengthen the rushed; motion
  cannot rescue a slow plan. Reading holds follow [`motion-timing.md`](motion-timing.md) and never
  go below the reading-time floor in
  [`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md). Let
  quiet sections of the music stay quiet.
- **Verify.** Watch once straight through at full speed and mark anything that still drags or
  rushes. `mgvideo check <project> --quick` reports text held too short.
- **Goes wrong when** every scene is the same length, the music is cut mid-phrase to fit a hold, or
  the piece ends up longer than asked.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/verbs/distill.md` and `skills/raea/craft/verbs/retime.md`, method credited to
Impeccable (pbakaus/impeccable, Apache-2.0).
