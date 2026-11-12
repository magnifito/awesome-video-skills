# Moves: critique and polish

How a review note maps to a named move: [`../../magnifito-video/reference/moves.md`](../../magnifito-video/reference/moves.md).
Severities are the `mgvideo validate` levels: P0 breaks the piece (a floor defect, a wrong fact),
P1 the audience would notice, P2 makes it better, P3 polish.

## critique

Judge the render as it came out, not as it was meant, before calling it done or when the person
asks whether it is good.

- **Assess.** Watch the final file once through, at the size it ships, with sound. Then make the
  frame sheets and stills from [`render-qa.md`](render-qa.md) section 2 at the moments that matter.
  Run `mgvideo validate` for what can be measured.
- **Decide.** Judge against the brief (`objective`, `audience`) and the mode guide first, the
  person's stated taste second, your own last. Ask whether the audience would notice; if not, it is
  P2 or below. Rank the few issues that matter most.
- **Change.** Write each issue as where (scene id or timestamp), what is wrong, why it matters to
  the audience, and its level. Name the strongest moment too, so later fixes keep it. Save the
  critique next to the run so the next pass and the person can read it.
- **Verify.** Every issue points at a frame or timestamp of the current render. Fix P0 and P1
  before anyone else sees it.
- **Goes wrong when** the critique is written from the plan or the code, every issue is P2, or a
  clean `validate` is read as "the piece is good". Validate finds defects; it does not judge the work.

## polish

The last pass before the person sees it. It works through the latest critique in the piece's own
direction and never hides a redesign.

- **Assess.** Open the latest critique; read the floor ([`floor.md`](floor.md)) once more.
- **Decide.** Polish or redesign: if the fixes add up to a new direction, stop and say so. When time
  is short, fix P0 to P2 and list the P3 items left.
- **Change.** Work from P0 down. Each fix is the move its issue calls for (quieter, retime,
  clarify, regrade, remix...). Keep the strongest moment the critique named.
- **Verify.** Render again, run `mgvideo validate`, look at the new sheets, and mark each critique
  issue fixed or say why not.
- **Goes wrong when** polish quietly changes the direction, sands the strongest moment down to match
  the rest, or marks an issue fixed without a new render to show it.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/verbs/critique.md` and `skills/raea/craft/verbs/polish.md`, method credited to
Impeccable (pbakaus/impeccable, Apache-2.0).
