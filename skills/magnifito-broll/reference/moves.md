# Moves: animate and layout

How a review note maps to a named move: [`../../magnifito-video/reference/moves.md`](../../magnifito-video/reference/moves.md).
Motion numbers (named moves, durations, overshoot) are in
[`../../magnifito-storyboard/reference/motion-timing.md`](../../magnifito-storyboard/reference/motion-timing.md).

## animate

"It's static", "bring it to life", "it feels like a slideshow". Motion added to something that
holds still, so each move says something.

- **Assess.** What should the motion say at each moment: arrival, emphasis, cause and effect, a
  change of state? A part with nothing to say stays still. Which beats does it land on: the
  speaker's words (`motion/transcript.json`), the music's hits, the cuts?
- **Decide.** What moves first in each beat and what stays still. One easing family for the piece:
  snappier for a pitch, slower and heavier for a story. Whether motion is the answer at all: a
  static frame may need a cut (recut) or a shorter hold (retime).
- **Change.** Animate entrances, one emphasis per beat, and exits; leave the rest still. Stagger
  related parts by a few frames instead of moving them together. Time clips in `plan.json` from
  word times, never by eye. Vary the move by the part's role; the same pop on every part is on the
  refuse list.
- **Verify.** Play at full speed, then step the frames around each beat (`mgvideo broll compose
  ... --sheet`): each move starts on its cue and settles before the next.
- **Goes wrong when** everything bobs or drifts all the time, moves land between beats because they
  were timed by eye, or type overshoots and wobbles (use a short ease on text, not a bouncy spring).

## layout

"It's cramped", "where do I look", "everything's the same size", "too much empty space", "the
logo's lost". Where things sit and how much room each gets.

- **Assess.** Name the one thing each moment is about. Is it the biggest, brightest or most central
  thing? Find what fights it: two things the same size, a panel over the speaker's face, text in a
  platform's UI zone, edges that almost line up. Judge at the size it ships (a phone for 9:16).
- **Decide.** The focal point of each moment before moving anything. One grid and one margin for
  the piece.
- **Change.** Make the focal point bigger or give it room; make the rest smaller rather than moving
  it away. Shared left edges and baselines, the same margin on every side. Keep panels in the empty
  part of the frame, off the face, and text out of the UI zones in
  [`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md).
- **Verify.** Stills at the same times before and after, at ship size: the eye goes to the right
  place first. `mgvideo validate` reports overlap and UI-zone issues for engines that record text;
  check motion-engine panels by hand.
- **Goes wrong when** everything is centred and the same size, space is spread evenly so the frame
  looks empty rather than calm, or a layout fixed for one size breaks in another.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/verbs/animate.md` and `skills/raea/craft/verbs/layout.md`, method credited to
Impeccable (pbakaus/impeccable, Apache-2.0).
