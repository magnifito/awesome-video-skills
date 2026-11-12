# Refuse list

Patterns that make a piece look like a template. Each one is refused by default. Use one only
when the brief or the person asks for it by name, and say why in that scene's `factual_purpose`.
These are taste rules; measured defects live in
[`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md).

| Refuse | Why | Do instead |
|---|---|---|
| Template captions: white bold text with one yellow word, a pop on every group | Every feed already has them; they say "made by a preset" | Take colour, face and motion from `brand.json`; accent only the word that carries the point |
| The same move on every beat (one entrance, one zoom, one sound) | Repetition makes every beat weaker | Vary the move by the part's role; spend the strong one on the hero beat |
| A whoosh on every entrance | Sound that fills instead of marking flattens every cut | Sound on the two or three moments that matter; leave the rest silent (`magnifito-audio` reference) |
| Cutting at a constant tempo (BPM times a bar count) | Feels mechanical and drifts off the real beats | Cut on the beat grid's events: downbeats, builds, stops, the drop |
| Effects stacked (bloom, grain, blur, glow, lens tricks) | They soften the thing the piece is about | One effect, where it means something |
| Glow on everything | Light is a cue; everywhere means nowhere | Glow only where the eye should go |
| Reflex bounce (overshoot or elastic easing on everything) | Reads as a default, not a choice | Settle with ease-out-cubic; overshoot only where the idea is bouncy ([`motion-timing.md`](motion-timing.md)) |
| Cameras that ease to a stop before each cut | Plays like a slideshow | Keep the camera moving through the cut |
| Drawn highlights where a cursor should act | A box is not a demo | A real cursor moves and clicks (`magnifito-product-demo`) |
| A tour of features | A list of capabilities is not a story | One project through one loop |
| Copy that sounds like an ad: buzzwords, "Not X. Y." cadences, a label above every headline | The viewer stops believing it | Plain, specific words from the audience's vocabulary |

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/floor.md` (Refuse) and `skills/raea/motion/words.md`, method credited to
Impeccable (pbakaus/impeccable, Apache-2.0).
