# Word-timed graphics

Distilled from the `talking-head-b-roll` skill by iart.ai (MIT), vendored at
`vendor/vxi-motion-tools/2fae287134109449676d9afbfd38318985d75121/skills/talking-head-b-roll/`.
Rules are restated for `mgvideo broll`; nothing from the vendored scripts is used.

## Three treatments, mapped to plan.json

| Treatment | What the viewer sees | In plan.json |
|---|---|---|
| Speaker | The recording alone | No clip covers that time |
| Overlay | Speaker stays, a small graphic sits beside them | `kind: "panel"` (transparent ProRes 4444 `.mov`) |
| Cover | An opaque full-frame scene, voice continues | `kind: "full"` (opaque H.264 `.mp4`) |

The recording is never cut, moved or scaled; every clip is a layer above it and the original
audio runs unchanged. Pick the treatment per line of the transcript, with a one-line reason:

- **Speaker** for the opening line, opinions, personal stories, emotional beats, the call to
  action and the closing line.
- **Overlay** when the line has one concrete thing worth seeing (a keyword, a number, a short
  list) and the speaker is still worth watching.
- **Cover** when the line is better shown than said: comparisons, figures, steps, how
  something works, a product UI, anything with three or more parts.

## Word timings

`mgvideo broll words captions.srt -o motion/transcript.json --txt motion/words.txt` gives
estimated word starts, spread across each caption cue by character count (about ±0.2 s). There
is no speech recognition, so:

- Anchor clip `in`/`out` and state changes on the **first or last word of a cue**. Those times
  come straight from the caption file; words in the middle of a long cue are guesses.
- Put clip boundaries **between words**, never inside one. With estimated times, the gap
  between two cues is the safest boundary. Manual check: find the word in `words.txt` and
  confirm the boundary is not between that word's start and the next word's start.
- If a caption mishears a figure and it does not add up with the rest of the talk, keep it off
  screen and say so in `notes`.
- Listen around every anchor in the preview. Estimated times are not frame-accurate.

## Lead, sync and wait

Decide the timing per element, not per clip. Record the anchor word, its time and the choice
in the plan table you show the user.

| Choice | Use for | How in our plan |
|---|---|---|
| Lead by ~6 frames | Structure the eye can prepare: axes, empty cards, a process outline | Set clip `in` about 6 frames before the word (0.2 s at 30 fps, 0.24 s at 25 fps) |
| Sync on the word | New facts: amounts, percentages, prices, ranks, final chart values | In a fragment, the state change that makes the fact readable lands at `word time − clip in` |
| Wait for the word | Punchlines, negations, withheld answers, conclusions | Nothing that gives the answer away appears before the revealing word starts |

"Sync" means the fact is **readable or settled** on the word, not that a long count-up or
morph only starts there. Start the preparatory motion earlier, but never show the answer early.
Example: on "revenue grew 30%", the chart frame can lead; the "30%" label and the final bar
height land on "30%". Values already said stay on screen as context.

Recipe clips (`motion-card-morph`, `motion-bars-chart`, ...) fill their slot with their own
pacing, so with recipes you only control `in` and `out`. When a fact must land on a specific
word inside the slot, write a fragment and put that state in `SEQ` at the clip-local time.

## Hold and exit

- An overlay leaves when the line moves on. One idea on screen at a time.
- A card with no words on it for more than about 0.6 s reads as an empty box: put text in it
  as it arrives.
- Make sure a clip's exit does not cut a synced fact short. A fact needs time to be read after
  it lands; if the slot ends too soon, extend `out` to the next cue boundary or merge the clip
  with its neighbour.
- Recipe clips end holding their last state; compose holds a fragment's last frame when it is
  shorter than the slot and cuts it at `out` when it is longer.

## Rhythm and density

House rules from `SKILL.md` stand (cutaways about 1.5–10 s, about 2 s of face between them,
state changes 0.4–1.2 s apart). The upstream rhythm adds:

- Open on the speaker and close on the speaker.
- No stretch of speaker-only longer than about 8 s; break it with a panel or a cutaway.
- A cover lands best at 3–8 s. Shorter than about 2.5 s feels like a flash; longer than
  about 8.5 s turns the video into a slideshow with voice-over.
- Do not put two covers back to back; return to the speaker between them.
- A sliver of speaker under about 1 s between two clips reads as a flicker. Let the clips meet
  (`out` of one equals `in` of the next) or leave a real gap.
- Change treatments at line boundaries, and prefer fewer, clearer clips over one on every line.

None of these are checked by `mgvideo broll check` (it checks `in < out`, the source length, overlaps,
paths, fps and `area` fitting the frame). Check rhythm by hand from the plan table.

## Face-safe zones for panels

Our plan has no face box; the panel `area` is the only guard. Before choosing it:

```bash
# Contact sheet of the source across one slot (here 12.0-18.5 s), 2 frames a second
ffmpeg -v error -ss 12.0 -to 18.5 -i work/source.mp4 \
  -vf "fps=2,scale=480:-2,tile=4x4" -frames:v 1 slot-12s.png
```

- Mark the speaker's head with hair plus a small margin on every frame of the slot. The panel
  `area` must not touch that box on any frame, not just the first.
- A panel that would cover more than about 40% of the frame is a cutaway: make it `full`.
- A panel must not reach the face at all. Any overlap is a stop condition (see `SKILL.md`).
- Keep text at least 3% of the shorter frame side away from every edge; some players crop.
  The preset areas already keep 5% horizontal and 8% vertical margins.
- A `full` clip must hide the speaker completely once its entrance is over. Manual check on
  the preview: a still from mid-slot shows no part of the recording.

After `mgvideo broll compose ... --sheet motion/out/contact.png`, read the sheet for faces
under panels, clipped text and graphics that disagree with the line.

## Alpha layer for the editor

Panel clips are ProRes 4444 with alpha; full clips are opaque. Compose refuses a panel clip
without a `yuva` pixel format. To confirm by hand that the alpha is really there:

```bash
# Expect codec_name=prores and pix_fmt=yuva444p10le
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height \
  -of default=nw=1 motion/out/01_0m00s60.mov
# Alpha plane of one frame: black = see-through, white = opaque. Most of it should be black.
ffmpeg -v error -ss 1 -i motion/out/01_0m00s60.mov -vf alphaextract -frames:v 1 alpha-01.png
```

In the editor, each clip goes on a track above the recording at its `in` (the file name
encodes it: `0m06s75` = 0:06.75). Premiere, Resolve and Final Cut read ProRes 4444 alpha; if
Resolve shows dark fringes, set the clip's alpha mode to Straight.

## Content

- Text on screen is the speaker's own words, a few key words at most, or figures and names from
  the transcript or the user's material. Never invent figures, claims or quotes.
- Burned-in full captions are a separate job; add them only when asked.
