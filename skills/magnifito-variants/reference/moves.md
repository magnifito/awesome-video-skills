# Move: adapt

How a review note maps to a named move: [`../../magnifito-video/reference/moves.md`](../../magnifito-video/reference/moves.md).

## adapt

"We need it in 16:9", "a square one for the feed", "a 6 second cut", "for YouTube". The same piece
made right for another size, length or platform; never a crop or an early stop of the old one.

- **Assess.** List the sizes, lengths and platforms from `brief.json` `formats` and the person's
  delivery list. For each, find what no longer fits: type that wraps, a face cut off, text inside a
  platform's UI zone, a hold too long for a shorter cut.
- **Decide.** Which size leads: lay out the one the brief favours first (9:16 for TikTok, Reels and
  Shorts) and make the others from it. What each size drops: a smaller or shorter version loses a
  whole element (a secondary line, a scene), it does not shrink everything. Whether a cut needs its
  own hook: a 15 s cutdown is its own edit, not the first 15 s of the 30 s.
- **Change.** Render each format from the same plan and assets with its own layout (section 1 of
  `../SKILL.md`). Place type and faces from each frame's UI zones
  ([`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md),
  `mgvideo safezone`). Wider frames get room, not bigger type. A shorter cut keeps the hook and the
  ending and drops whole scenes from the middle, cut on words; its scene durations sum to its own
  length. Name every file for its size and length (`magnifito-deliver`, "File names").
- **Verify.** `mgvideo validate` on every export, with the right `platform` in `validate.json` for
  9:16. Sheets of each size side by side: every size says the same thing and nothing is cut off.
- **Goes wrong when** type that is tiny in 9:16 was scaled from 16:9, a face sits behind a platform's
  buttons because it was placed by eye, the short cut ends mid-sentence, or the sizes drift apart
  after a later note (change the shared plan, not one export).

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/verbs/adapt.md` and `skills/raea/motion/delivery.md`, method credited to
Impeccable (pbakaus/impeccable, Apache-2.0).
