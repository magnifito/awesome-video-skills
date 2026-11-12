# Render QA checklist

Rules distilled from opus-visual-motion-engine (Yuri Queiroz Lobo), motion-designer (kaventro),
claude-motion (whaleyxbt) and video-production-skills (Video Production Skills contributors), all
MIT, vendored at `vendor/vxi-motion-tools/2fae287134109449676d9afbfd38318985d75121/skills/`.
Rewritten for mgvideo. No upstream code is run or imported.

Each item is tagged:
- **[validate]**: automated by `mgvideo validate <run>` (checked in `packages/cli/src/commands/validate.ts`).
- **[cmd]**: run the command shown and read the output.
- **[manual]**: a person (or Claude, looking at frames) has to judge it.

Paths below use `<project>/runs/<run-id>/final_output_<run-id>.mp4` as `final.mp4`.

## 0. What the tools already check

`mgvideo validate <run>` (`latest` or no run id: the newest run of `-p <project>`; `--out <file>`
saves the report, `--json` makes it JSON) does exactly this, and nothing more. Each failed
check is ranked P0 to P3 with a fix; the run fails (exit 1) only on P0 or P1:
- **[validate]** Every output file exists and its SHA-256 matches `render-result.json`.
- **[validate]** Width and height match the render request; fps within 1.0 of it; an audio stream exists.
- **[validate]** `scene-plan.json` and `claims.json` still hash to what the run was rendered from.
- **[validate]** Every `claims_refs` id exists, and its `approved_wording` appears in the scene's
  `copy_text`. This checks the plan text, not the pixels: still read the frames.
- **[validate]** On-screen text, from the `text-manifest.json` the HyperFrames and html engines write
  (other engines: a P3 note, check text by hand). `mgvideo check <project> --quick` runs the same
  rules from the scene plan before rendering, and the plugin runs it after each project-file edit. Every text element is placed with its animation;
  the numbers are in [`floor.md`](floor.md):
  - text resting more than 1 px outside the frame, P0;
  - text inside the platform UI zones (`"platform"` in `validate.json`, default `generic`), P1;
  - text below the size floor, P1 for scene copy, P2 for labels;
  - contrast under 3:1 against the pixels behind it in the final file, P1; body text under 4.5:1, P2;
  - unnarrated copy readable for less than max(0.3 s per word, 1 s), P2;
  - two visible texts overlapping more than 20 % of the smaller one, P2.
- **[validate]** Measured on the final file with ffmpeg:
  - loudness: integrated LUFS within 1 LU of the request's `target_loudness_lufs` (default -16), P1;
  - true peak at or below `true_peak_ceiling_db` (default -1 dBTP), P1;
  - a silent audio track, P2;
  - dead stop: a steady bed (1 s, under 3 dB spread, above -50 dBFS) that drops 12 dB in 10 ms
    and stays 24 dB down for 0.3 s, P1;
  - still picture (`freezedetect=n=-60dB:d=3`): P2 from 3 s, P1 from 6 s or half the video;
  - black (`blackdetect`, 0.5 s or more), P2;
  - flashing: more than 3 flashes (6 opposing luminance swings) in one second over a quarter of a
    third-of-frame window (WCAG 2.3.1; red flashes are not checked), P1.

`<project>/validate.json` sets targets (`loudness_lufs`, `loudness_tolerance_lu`,
`true_peak_max_db`, `freeze_min_s`, `freeze_blocking_s`, `black_min_s`, `platform`) and per-rule overrides,
each with a reason that the report prints next to the check:
```json
{ "rules": { "freeze": { "severity": "P3", "reason": "the closing logo hold is deliberate" } } }
```
A severity of `"off"` drops the rule. An invalid file stops validate (exit 2).

Not in validate: text over faces, red flashes, captions. Asset rights are enforced earlier, by
`mgvideo render` (assets must be `approved` and not expired). `mgvideo gate <project>` adds brief
JSON, zero media budget, Cyrillic glyph coverage of the brand font for `bg` projects, and a master
with audio and non-zero duration.

## 1. Determinism

A frame must be a pure function of time. Same inputs, same pixels.
- **[cmd]** Render twice and compare frame by frame:
  ```bash
  mgvideo render <project> --force          # run A
  mgvideo render <project> --force          # run B
  # one MD5 per decoded frame; identical lists mean identical pictures
  ffmpeg -v error -i runA.mp4 -map 0:v:0 -f framemd5 a.framemd5
  ffmpeg -v error -i runB.mp4 -map 0:v:0 -f framemd5 b.framemd5
  diff a.framemd5 b.framemd5 && echo "frames identical"
  ```
  Equal file SHA-256 values in the two `render-result.json` files is the strongest result, but
  container metadata can differ while frames match. The framemd5 diff is the real test.
- **[cmd]** `mgvideo diff runA.mp4 runB.mp4` passes at SSIM >= 0.95. That catches gross drift only;
  it does not prove determinism.
- **[cmd]** Scan a generated motion page for clock or state sources; every hit needs a reason (use a
  seeded PRNG, compute motion from `t`):
  `grep -nE "Math\.random|Date\.now|performance\.now|new Date\(|setTimeout|setInterval|requestAnimationFrame|transition:|animation:" page.html`
- **[manual]** Seek-order test: grab the same time after seeking from different places (for
  example `mgvideo thumbnail final.mp4 -t 8.0` versus a still from a fresh render of that clip
  alone). Any difference means state leaks between frames: counters, caches, an image still
  decoding, a font not loaded yet.

## 2. Review material: sheets, strips, stills

Never call a render done without looking at frames of the current render.
- **[cmd]** Overview sheet, one tile every 0.5 s, each labelled with its time:
  ```bash
  ffmpeg -v error -i final.mp4 -vf "fps=2,drawtext=text='%{pts\:hms}':x=12:y=12:fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6,scale=320:-2,tile=6x4" sheet-%02d.png
  ```
- **[cmd]** Transition strip, 0.3 s each side of a cut at 20 fps:
  ```bash
  # cut at 12.0 s: start 0.3 s before it, take 0.6 s, 12 tiles in one row
  ffmpeg -v error -ss 11.7 -t 0.6 -i final.mp4 -vf "fps=20,scale=320:-2,tile=12x1" -frames:v 1 cut-12.0.png
  ```
  `drawtext` in the overview command needs an ffmpeg built with fontconfig; drop it if it errors.
- **[cmd]** Full-size still to judge text: `mgvideo thumbnail final.mp4 -t 8.2 -o still-8.2.png`.
- **[manual]** Sample settled states: take tiles about 0.3 s after each beat or scene start, so
  motion has landed. A tile mid-hold that still shows moving text means the hold is too short.
- **[manual]** Phone check: view the sheet at 360 px wide. What does not read there does not read in a feed.
- **[cmd]** B-roll over footage: `mgvideo broll compose <plan> <out> --sheet sheet.png`.

## 3. Text collisions and clipping

- **[validate]** Overlap (`text-overlap`) and clipping (`text-clipped`) are measured for the
  HyperFrames and html engines. Deliberate layering (title over footage) is fine; record it as a
  `validate.json` override with the reason.
- **[manual]** No truncated labels, no descenders cut by a mask (mask height at least 1.3x the font
  size), no text crossed by a moving element, no one-frame flash of a layer in its end position,
  no layer popping in or out without motion.
- **[validate]** Safe areas (`text-safe-zone`): text against the UI zones in [`floor.md`](floor.md).
- **[cmd]** To see the zones: `mgvideo safezone final.mp4 --platform reels -o safezone.mp4` burns the
  same 9:16 margins on (`--platform tiktok|reels|shorts|generic`, default `tiktok`; `--color` sets
  the dashed outline), then make a sheet of it. Logos and faces have no check; keep them out too.

## 4. Contrast

- **[validate]** `text-contrast`: 3:1 against the pixels behind the text (P1), 4.5:1 for body text
  (P2). The background is the half of the box's pixels least like the text colour, at the middle of
  the text's settled time. Text over moving footage can pass at that moment and fail at another;
  look at the sheet.
- **[manual]** Text over busy graphics or footage (upstream: over 14% of the text box): add a scrim,
  move the text, or pause the background.

## 5. Minimum type size

- **[validate]** `text-size`: 60 px at 1080 wide for 9:16, frame height / 60 for other aspects (see
  [`floor.md`](floor.md)). Check at phone width, not at 100% on a monitor.
- **[manual]** If the brand font did not load, every width is wrong. Fix the font before judging layout.
- **[cmd]** `mgvideo gate <project>` confirms Cyrillic coverage for `bg` projects.

## 6. Dead air, empty beats, holds

Detectors only flag candidates. Look at each flagged range: a hold may be intended.
- **[validate]** No visual change (freeze) from 3 s, and black spans from 0.5 s, are measured by
  `mgvideo validate`. To look at one by hand:
  ```bash
  ffmpeg -v info -i final.mp4 -vf "freezedetect=n=-60dB:d=3" -map 0:v:0 -f null - 2>&1 | grep freeze_
  ```
- **[cmd]** Near-empty or black spans of 0.5 s or more (a shorter dip between scenes can be a cut):
  ```bash
  ffmpeg -v info -i final.mp4 -vf "blackdetect=d=0.5:pix_th=0.10" -map 0:v:0 -f null - 2>&1 | grep black_
  ```
- **[cmd]** Silence: `ffmpeg -v info -i final.mp4 -af "silencedetect=n=-50dB:d=1" -f null - 2>&1 | grep silence_`
- **[manual]** Frame 0 is a composed image, not black (feeds use it as the thumbnail; check with
  `mgvideo thumbnail final.mp4 -t 0`). The last 0.1 s is settled, not mid-motion.
- **[validate]** Reading time (`text-reading-time`): unnarrated copy readable for max(0.3 s per
  word, 1 s). **[manual]** The final line holds at least 2 s, and a number gets time to land.
- **[manual]** Something new every 2 to 4 s, and scenes hand over to each other instead of fading
  to an empty frame and back.

## 7. Caption sync

Full rules are in `skills/magnifito-audio/reference/beat-and-sound-sync.md`. At delivery:
- **[cmd]** Measured duration: `ffprobe -v error -show_entries format=duration -of csv=p=0 final.mp4`.
  No caption may end after it.
- **[cmd]** `mgvideo broll words captions.srt -o words.json` fails on malformed timestamps. Word
  times it writes are estimates (about 0.2 s), not speech recognition.
- **[manual]** Every cue: start >= 0, end > start, no overlaps (unless two speakers), at least 0.65 s
  on screen, no more than 20 characters per second.
- **[manual]** Watch with sound at normal speed: each caption appears with its words and clears the
  safe area and on-screen text at the delivered aspect ratio.

## 8. Release checklist

1. **[cmd]** Record the version: SHA-256 of video, captions and cover (`shasum -a 256 <files>`). Every
   finding below refers to these files.
2. **[validate]** `mgvideo validate <run>` passes. **[cmd]** `mgvideo gate <project>` passes.
3. **[cmd]** Specs: `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate -of default=nw=1 final.mp4`
   (expect `yuv420p` for opaque H.264).
4. **[validate]** Loudness: -16 LUFS within 1 LU, true peak at or below -1 dBTP (see [`floor.md`](floor.md) and
   `magnifito-audio`); `mgvideo inspect final.mp4` shows the numbers.
5. **[cmd]** Determinism (section 1) and detectors (section 6) run on this exact file.
6. **[manual]** Sheets and transition strips reviewed (sections 2 to 5); captions watched (section 7).
7. **[manual]** Listened on headphones; names, numbers and qualifiers checked against `claims.json`.
8. **[manual]** Rate each issue: P0 false or unusable, P1 hurts understanding, sync or delivery,
   P2 polish. Note time, evidence, fix and how it will be rechecked. P0 and P1 block delivery.
9. **[manual]** Status: if any viewing or listening step was skipped, it is a review version, not a
   delivery. Say which step is missing. Never report a check you did not run.
10. **[cmd]** `mgvideo package <run>` and sign the review record.
