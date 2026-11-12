# Move: clarify

How a review note maps to a named move: [`../../magnifito-video/reference/moves.md`](../../magnifito-video/reference/moves.md).

## clarify

"I don't get it", "what does that mean", "the wording", "say it simpler", "the narration is off".
The words: narration, captions, titles and labels. It lives here because explain pieces depend on
it most; promos and edits use the same steps.

- **Assess.** Read every line aloud at the speed it plays. Mark each line the brief's `audience`
  would not understand on first hearing, every name the voice says that is not on screen as it is
  said, jargon, abstractions, and lines that describe what the picture already shows.
- **Decide.** Use the audience's vocabulary, not the team's or the product's. Split the work: the
  picture shows what it is, the narration says why it matters. Try cutting a line before
  rewriting it.
- **Change.** Plain, specific words, one idea per line. Every name said is shown; every thing the
  viewer must find is named (zoom to it as it is said). A changed line that carries a fact keeps
  its `claims.json` `approved_wording` verbatim. Re-time cues and captions from the new
  transcript (`mgvideo transcribe`), never by eye.
- **Verify.** Play it with sound only, then picture only: both make sense, and together they do
  not repeat each other. `mgvideo validate` reports caption drift and names not on screen when a
  transcript is present.
- **Goes wrong when** lines got longer while getting "clearer" (split the scene or cut a line),
  plain turned vague ("it's easy", "everything you need"), or captions and cues still follow the
  old words.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/verbs/clarify.md`, method credited to Impeccable (pbakaus/impeccable, Apache-2.0).
