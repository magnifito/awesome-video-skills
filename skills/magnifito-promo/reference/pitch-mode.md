# Pitch mode

Ads, launch spots, offers, app store previews. The piece works when a viewer who did not plan to
watch stops, believes one thing, and knows the one action to take. Delivery numbers (UI zones,
text size, reading time, loudness) are in
[`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md); this
file does not repeat them.

## Rules

| Rule | What it means in a Magnifito project |
|---|---|
| Hook within 2 s | Scene 1 says and shows the reason to keep watching by 2.0 s (frame 60 at 30 fps). A logo, a greeting or a slow push on nothing is not a hook. |
| One belief | Write it in `brief.json` `objective` as a viewer would repeat it to a friend: what changes for them ("my edit ships the same day"), not a feature ("it has AI editing"). Every scene argues it. A second idea halves the first. |
| One proof | The product doing the thing, on screen, at the moment the copy claims it: the real screen, result or person. The fact behind it is a `claims.json` entry. A claim with nothing shown convinces nobody. |
| One ask | The action the brief names (install, book, try), in its working form (name, link, handle). "Learn more" only when the brief has no real action. |
| End card at least 2 s | The ask holds 2 s or more after it settles, inside the UI zones of the platform it ships to. |
| Works muted | Feeds play muted. Picture and burned-in words make the argument; the voice adds to it. |
| Specific | Cover the logo. If another product could run the piece unchanged, the angle is not specific yet. |
| Planned | Hook, problem, proof, ask as a scene plan, approved before the full render. |

## Decisions to question

- **What opens.** The easy default is problem first. When the proof is strong enough to stop a
  scroll, open on the proof and let the problem explain why it matters.
- **Length.** Use the length each delivery asks for. A cutdown is its own edit with its own hook,
  not the long cut stopped early (see `magnifito-variants` `reference/moves.md`, adapt).
- **Where motion and sound go.** Two or three moments carry the argument. Spend motion and sound
  there and nowhere else.

## The rut

Template captions (white bold, one yellow word), a zoom on every sentence, a whoosh on every
entrance, a big number with nothing behind it, glass cards over footage. The full refuse list is
in [`../../magnifito-storyboard/reference/refuse.md`](../../magnifito-storyboard/reference/refuse.md).

## How it fails

| Symptom | Why | Fix |
|---|---|---|
| People leave in the first seconds | The opening is a logo, a slow push or a setup line | Open on the proof or the sharpest line |
| Viewers remember the ad, not the product | The proof is generic: stock, a mood, a claim with nothing shown | Show this product doing its thing, on screen, as the copy says it |
| It reads as a template ad | A zoom on every sentence, a whoosh on every entrance | Keep motion and sound for the two or three moments that carry the argument (quieter) |
| The ask goes by unread | End card up under 2 s, or under a platform's buttons | Hold it 2 s or more, inside the UI zones |
| A claim nobody can stand behind | A number, quote or result not in `claims.json` | Remove it, or ask the person for the real one and register it |

## Check

- Mute it. Does the picture alone make the argument?
- Watch only the first 2 s (`mgvideo thumbnail <final> -t 0` and `-t 2`). Would you stop?
- Every fact on screen has a `claims_refs` entry.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/modes/pitch.md`, method credited to Impeccable (pbakaus/impeccable, Apache-2.0).
