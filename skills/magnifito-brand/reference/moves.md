# Moves: typeset and extract

How a review note maps to a named move: [`../../magnifito-video/reference/moves.md`](../../magnifito-video/reference/moves.md).

## typeset

"I can't read it", "the font", "too small on my phone", "the title looks cheap", "too many fonts".
The type on screen: face, size, spacing and how long it stays.

- **Assess.** Read every line at the size it ships, for as long as it is on screen. Count the faces
  and weights in the render and name the job of each. Check the measure: lines too long to take in
  at a glance, one word alone on a line.
- **Decide.** Faces and weights come from `brand.json` `fonts`; a second face only when it has a job
  the first cannot do. Sizes come from the smallest screen it plays on; the minimum is the size floor
  in [`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md).
- **Change.** One face, two at most. Contrast from size and weight, not from more fonts. Break lines
  by sense, one idea per line, no orphan. Tighten tracking on large type, loosen it on small caps.
  Hold each line long enough to read twice (reading holds in
  [`../../magnifito-storyboard/reference/motion-timing.md`](../../magnifito-storyboard/reference/motion-timing.md)).
  For Bulgarian, keep a Cyrillic-capable face (`supports_cyrillic`).
- **Verify.** Stills of each line at phone size; read them aloud at speaking pace. The faces in the
  still are only the ones `brand.json` names (a fallback face means the font did not load). `mgvideo
  check <project> --quick` for size, contrast and reading time.
- **Goes wrong when** the render shows a fallback face, one word sits alone on the last line, or
  captions sit over a face or under a platform's buttons.

## extract

"Make the brand kit from this video", "match our last campaign". Read a brand profile out of
finished work the person supplies.

- **Assess.** Pull stills from the reference (`mgvideo thumbnail <file> -t <s>`) at moments with
  logo, headline, body text and background. Note the colours that repeat and what each is used for,
  the faces and weights, corner radius, and how things move (tempo, camera).
- **Decide.** Use work the person approved recently, not everything they have made. Only what
  repeats becomes a token; a one-off is an accident, not the brand. Ask the person for the real logo
  and font files with their licences: never take a logo from a frame grab or guess a font.
- **Change.** Write `brand.json`: colours by role (`primary`, `background`, `text_primary`,
  `accent`), fonts with rights evidence, `motion_preferences` (`tempo`, `camera_style`). Tell the
  person which values are guesses and get them confirmed.
- **Verify.** `mgvideo brand check <project>` passes; a styleframe of scene 1 reads as the same brand
  as the reference, side by side.
- **Goes wrong when** a colour sampled from footage (a skin tone, a lamp) became a brand colour, a
  font was matched by eye with no licence, or a guess was written down as fact.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/verbs/typeset.md` and `skills/raea/craft/verbs/extract.md`, method credited to
Impeccable (pbakaus/impeccable, Apache-2.0).
