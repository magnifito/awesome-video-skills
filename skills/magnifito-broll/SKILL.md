---
name: magnifito-broll
description: "Add speech-timed motion B-roll to talking-head footage: transparent panels beside the speaker and full-frame cutaways, planned in plan.json, rendered with the motion engine and composited over the source with its original audio."
---

# Magnifito B-Roll: motion graphics on footage

Turn a talking-head video and its captions into motion-graphic B-roll timed to the speaker's
words. Each clip is one spring-driven shape that morphs and never cuts (the vendored
Barty-Bart motion-graphics engine, MIT). Clips are either:

- **panel**: a transparent clip (`bg:null`) in the empty part of the frame. The speaker stays
  on screen. Rendered to ProRes 4444 `.mov` with alpha.
- **full**: an opaque full-frame cutaway that replaces the speaker for the length of one idea.
  Rendered to H.264 `.mp4`.

Requirements: ffmpeg, Google Chrome (or `CHROME_PATH`), and `playwright-core` from the toolkit's
`npm install`. `mgvideo doctor` reports all three.

## Workflow

```bash
mgvideo broll words captions.srt -o motion/transcript.json --txt motion/words.txt
# write motion/plan.json (below), then:
mgvideo broll check   motion/plan.json
mgvideo broll render  motion/plan.json            # --only 01,03 to re-render some clips
mgvideo broll compose motion/plan.json motion/out/preview.mp4 --sheet motion/out/contact.png
```

1. **Transcript.** `broll words` reads an SRT or VTT file and spreads each cue's span across
   its words by character count (about ±0.2 s). It writes a Transcript contract JSON (`-o`)
   and/or upstream `words.txt` (`--txt`, one line per cue, `start:word`). There is no speech
   recognition in the toolkit: if you only have the video, ask for an SRT/VTT export from the
   editor or captioning tool. Put important changes on the first or last word of a cue, where
   the estimate is best.
2. **Plan.** Pick the moments, one idea per clip, and decide panel, full or nothing for each.
   Timing rules (lead, sync, hold, rhythm, face-safe areas): `reference/word-timed-graphics.md`.
   Show the user a table (in–out, the line, what the shape does, panel/full, why) and get
   approval before rendering.
3. **Check.** `broll check` validates the plan against its directory and the probed source.
4. **Render.** `broll render` renders each clip at the source video's resolution and frame
   rate. Pages land in `<plan dir>/dist/<id>.html` (open one in a browser to preview it in a
   loop); clips go to each clip's `file`. Rendering captures 4 sub-frames per frame for motion
   blur, so it is slower than real time.
5. **Compose.** `broll compose` lays the clips over the source (TS port of upstream
   `composite.py`): each clip shows from `in` to `out`, a clip shorter than its slot holds its
   last frame, `.mov` clips composite with alpha, the original audio is kept (re-encoded to
   AAC) and the output is H.264 with faststart. `--sheet` writes a contact sheet around every
   clip window. **Read the contact sheet yourself** before handing anything over.

Say plainly that `preview.mp4` is for review. For the final cut the user places the clips in
their editor, where they can nudge timing, add transitions and mix audio.

## plan.json

```json
{
  "title": "Episode 12",
  "video": "work/source.mp4",
  "fps": "30000/1001",
  "brand": "brand.json",
  "clips": [
    { "id": "01", "title": "Pipeline", "line": "“First you plan, then render…”",
      "in": 0.6, "out": 4.0, "kind": "panel", "area": "right",
      "recipe": "motion-card-morph",
      "scene": { "copy": "B-roll pipeline | Plan the clips | Render with motion | Compose" } },
    { "id": "02", "title": "Ship it", "line": "“And then you ship it.”",
      "in": 4.4, "out": 5.8, "kind": "full",
      "recipe": "motion-kinetic-type", "scene": { "copy": "Then you ship it" } },
    { "id": "03", "title": "Custom", "in": 9.0, "out": 14.0, "kind": "panel",
      "fragment": "clips/03-custom.html", "file": "out/03-custom.mov" }
  ],
  "notes": ["Bars in clip 03 are illustrative (relative size only)."]
}
```

| Field | Meaning |
|---|---|
| `video` | Source footage. |
| `fps` | Optional. When given it must match the probed source; clips always render at the source fps. |
| `brand` | Optional brand.json (brand contract). Colours and font files drive the recipes. Without it, the upstream look: warm grey canvas, black ink, white cards, orange accent. |
| `clips[].in` / `out` | Seconds on the source timeline. `in < out`, `out` within the source, no two clips overlap (one clip's `out` may equal the next `in`). |
| `clips[].kind` | `panel` (transparent `.mov`) or `full` (opaque `.mp4`). |
| `clips[].recipe` + `scene.copy` | A motion recipe and its copy. `scene.logo` gives the logo file for `motion-logo-reveal`. |
| `clips[].fragment` | A hand-written clip fragment instead of a recipe. |
| `clips[].area` | Panel safe area: `"right"` (default), `"left"`, `"top"`, `"bottom"`, or `{ "x", "y", "w", "h" }` in source pixels. |
| `clips[].file` | Output clip. Defaults to `out/<id>_<m>m<ss>s<cc>.mov|mp4`, named by the in-point (`0m06s75` = 0:06.75). |

Every path is relative to the directory holding plan.json and must stay inside it (absolute
paths and `..` escapes are rejected). Keep the source in that directory, e.g. `work/source.mp4`.

Recipes and minimum slot lengths:

| Recipe | Panel | Full | Min | Copy |
|---|---|---|---|---|
| `motion-card-morph` | yes | yes | 3.0 s | `Headline | row | row | row` (up to 4 rows) |
| `motion-bars-chart` | yes | yes | 1.6 s | `Title | Label: 12 min | Label: 40 min` (up to 6 values) |
| `motion-kinetic-type` | no | yes | 0.8 s | the line, words land on a grid |
| `motion-logo-reveal` | no | yes | 1.2 s | tagline, plus `scene.logo` |

Recipe clips fill their slot and end holding their last state. For anything else (a terminal,
a slider, tabs, a file drag), write a fragment.

## Panel or full: the creative call

Decide per clip and say why.

- **Full-frame cutaway** when the frame is all speaker and the line describes something to
  *see*: a product, a process, a comparison, a number, a chapter change. Cut away for the
  length of the idea (about 1.5–10 s), then give the face back. Not in the first second of the
  hook, not on personal, emotional or opinion lines. Leave about 2 s of face between cutaways.
- **Panel** when the edit already leaves room: a PiP layout, a split, a plain side of the frame.
  Panels can run long (15 s+) as one continuous morph because the speaker stays on screen.
- **Nothing** when the line is about the speaker or too close to another clip.

## Safe areas for panels

- Look at the footage first (`mgvideo inspect`, or a contact sheet of the source) and find where
  the speaker is at every moment of the slot, not just the first frame.
- The presets take 45% of the frame on one side, with 5% horizontal and 8% vertical margins.
  `"right"` suits a speaker on the left third, and so on. When the speaker sits near the centre,
  give an explicit rectangle that clears their head and shoulders, or use a full clip.
- Recipe panels are centred in the area and sized to it. During morphs the camera is clamped so
  the shape never grows past the area, and the cursor stays inside it.
- Keep panels clear of burned-in subtitles and lower thirds; use `"top"` when captions sit at
  the bottom.
- On dark footage the default cards are white with black ink; on light footage pass a brand
  whose colours contrast with the background.

## Custom clips (fragments)

Write fragments in the upstream motion-broll format, following
`skills/magnifito-promo/reference/motion-engine.md` (fragment skeleton, `window.M` engine API,
patterns). For B-roll:

- Set `W`/`H` to the source resolution. Render fails if the stage size differs.
- Panel fragments use `bg:null` and move the camera with `center:[x,y]` into the empty area;
  full fragments set an opaque `bg`. Render fails if the alpha does not match `kind`.
- Clip-local time = word time − clip `in`. Put each state change on its word.
- A fragment renders for its own `T`; if that is shorter than the slot, compose holds its last
  frame. If it is longer, compose cuts it at `out`.

## Content rules

- Never invent numbers, quotes, prices or results. Use labels and figures from the transcript or
  the user, or relative bars, and list what is illustrative in `notes`.
- One idea per clip. Pace changes to speech, about 0.4–1.2 s apart.
- No particles, glows, gradients on UI chrome, bouncy easing or template-looking cards.

## Stopping conditions

- Stop if a panel overlaps the speaker's face or body at any moment of its slot, or covers
  subtitles.
- Stop if `broll check` reports a problem; fix the plan rather than the paths.
- Stop if the contact sheet shows clipped, unreadable or off-word content.
