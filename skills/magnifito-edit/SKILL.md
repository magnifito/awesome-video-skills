---
name: magnifito-edit
description: "Cut and retime existing footage, remove silence, and maintain strict dual-timeline mappings between raw and edited timelines."
---

# Magnifito Footage Editing & Dual-Timeline Cuts

The `magnifito-edit` skill handles cutting, trimming, and pacing of real client recordings, ensuring transcript word times and overlay graphics stay synchronized across edits.

## Dual-Timeline Integrity

Editing alters presentation times. Word timestamps from the original transcript do not align with the edited output unless explicitly mapped:

1. **Source Timeline**: Stored in integer microseconds (`source_start_us`, `source_end_us`).
2. **Output Timeline**: Stored in integer half-open frame intervals `[output_start_frame, output_end_frame)`.
3. **Edit Decision List (`edl.json`)**:
   - Every cut records `cut_id`, source range, output range, speed factor, and reason.
   - B-roll, captions, and graphics target the output timeline via `TimelineMapper`.
   - Never overwrite or mutate the original transcript timestamps.

## Pacing Rules

- **Silence Removal**: Truncate pauses longer than 600ms down to 150-250ms for punchy pacing.
- **Word Boundaries**: Never cut closer than 50ms to the start or end of a spoken phoneme.
- **Meaning Preservation**: Ensure cuts do not invert the speaker's intent or omit critical qualifiers.

## Object Separation (`mgvideo separate`)

Use it when a shot needs the subject (a person, product or hand) on its own layer: text or graphics
behind the speaker, a background swap, or a highlight on the product. It runs SAM 2.1 locally and
uploads nothing. The method is ported from Barty-Bart's object-separation skill (MIT). Skip it when
the footage was shot on green or blue screen (`mgvideo chromakey` is faster) or when a static matte is
enough (`mgvideo matte`).

1. **One-time setup**: `mgvideo setup separate` creates a Python venv in the user cache
   (`$XDG_CACHE_HOME/mgvideo/venvs/separate`, default `~/.cache/...`) with pinned torch and
   transformers. It needs Python 3.12 or newer. `mgvideo doctor` reports whether the venv exists and
   which device it will use. Model weights (156 MB to 898 MB) download into the Hugging Face cache on
   the first run, never into the repo.
2. **Pick points on the start frame**: look at frame `--start` first. Use source-pixel coordinates.
   Put two or three `--point x,y` on the subject (label `1`, the default) and one `--point x,y,0` on
   anything that must stay out (fingers holding a product, packaging, the table).
3. **Run a short range first** (about 20 frames), check it, then run the full range:
   ```
   mgvideo separate clip.mp4 --point 480,270 --point 520,300 --point 100,60,0 --start 0 --end 20 --out work/sep
   ```
   `--model tiny|base-plus|large` overrides the hardware choice (CUDA with 12 GB or more: large;
   smaller CUDA or Apple Silicon: base-plus; CPU: tiny). `--format mov|webm|both` picks the cut-out.
4. **Cost**: about 5 s per frame on CPU (a 10 s clip at 30 fps is about 25 minutes), well under 1 s
   on Apple Silicon or CUDA. The command prints an estimate before it starts. On CPU, separate only
   the frames you need.
5. **Outputs** in `--out`: `masks/%05d.png` (one per frame, numbered by source frame, white = subject),
   `preview.mp4` (the subject tinted green with the original audio, for review), `cutout.mov`
   (ProRes 4444 with alpha) and/or `cutout.webm` (VP9 with alpha), and `separate.json` (device, model,
   timings). Masks stay on disk, so later composites reuse them without running separation again.

Check the preview at the start, the middle and any moment where something passes in front of the
subject. If green spills onto something else, add a label-0 point on it and run again. If part of the
subject is missing, add a label-1 point there. Masks are hard-edged: clean on objects and hands,
weaker on soft hair. The clip must be constant frame rate; convert it first with
`ffmpeg -i in.mp4 -fps_mode cfr -r 30 out.mp4` if the command reports variable frame rate.

## Stopping Conditions

- Fail if an edit interval creates a negative duration or references source microseconds beyond media length.
- Fail closed on `mgvideo separate` errors (no venv, point outside the frame, range past the last frame, variable frame rate). Do not fall back to a guessed mask.
