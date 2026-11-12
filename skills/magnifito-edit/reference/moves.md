# Moves: recut and regrade

How a review note maps to a named move: [`../../magnifito-video/reference/moves.md`](../../magnifito-video/reference/moves.md).

## recut

"The order is wrong", "start with that", "that cut is jarring", "swap those", "the ending". The
order of scenes and how shots join.

- **Assess.** Does each scene depend only on what came before it? Is the strongest image where the
  mode wants it: the hook first in a pitch, the payoff last in an explain, the poster frame where a
  story builds to? At each cut, name what joins the two shots: matched motion, a planned reversal,
  or a hard cut on a hit. A cut with no reason is a jolt.
- **Decide.** The order the mode wants, and what each cut joins on, before moving anything.
- **Change.** Move whole lines in `keep.txt` (or whole scenes in the plan), then rebuild `edl.json`
  with `mgvideo edit cut` so captions, B-roll and graphics follow through the timeline mapper. Join
  motion to motion: a shot ends still moving and the next starts moving the same way. Cut on the
  beat grid's events, never at a constant tempo. Short fades at audio cuts are in
  [`../../magnifito-audio/reference/mix-levels.md`](../../magnifito-audio/reference/mix-levels.md).
- **Verify.** Watch every changed cut at full speed (the cut strip in
  [`../../magnifito-deliver/reference/render-qa.md`](../../magnifito-deliver/reference/render-qa.md)
  section 2), then the whole piece.
- **Goes wrong when** words and picture no longer meet after the move (re-time from the transcript),
  two shots of the same framing sit side by side as an unplanned jump cut, or music is cut
  mid-phrase.

## regrade

"Too warm", "it's muddy", "the colours", "too dark". Colour and light.

- **Assess.** What does each colour mean in this piece (`brand.json` colours, the story's world)?
  On the note's part, judge temperature, brightness and saturation against what surrounds it, on a
  still (`mgvideo thumbnail`), not from memory.
- **Decide.** Fix the source when you can (re-shoot, a different take, a brand colour) before
  grading on top. A grade cannot add light the shot does not have.
- **Change.** Grade the clips the note names, not the whole film: `mgvideo grade <clip> -p <preset>`
  applies one preset (`rec709-neutral`, `cool-tech`, `warm-vibrant`, `high-contrast`, `matte-film`);
  anything finer is a plain ffmpeg filter on that clip. Keep the accent the
  brief names and pull the rest away from it. Neutral and bright unless the look asks otherwise; no
  crushed blacks.
- **Verify.** The same stills before and after, side by side, at the size it ships. In dark frames
  check the export for blotching. Skin tones stay natural.
- **Goes wrong when** skin went off with the rest of the frame, the whole frame shifted so the accent
  no longer stands apart, or crushed blacks blotch in the export.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/verbs/recut.md` and `skills/raea/craft/verbs/regrade.md`, method credited to
Impeccable (pbakaus/impeccable, Apache-2.0).
