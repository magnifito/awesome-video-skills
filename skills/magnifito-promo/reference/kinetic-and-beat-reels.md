# Kinetic type and beat-locked reels

Rules distilled from `kinetic-reel` (tuzhechen2005, MIT), `hyperframes-motion-reel`
(Sunwood AI Labs, MIT) and the taste numbers in `claude-motion-motion-design` (whaleyxbt, MIT),
vendored at `vendor/vxi-motion-tools/2fae287134109449676d9afbfd38318985d75121/skills/`.
Rewritten for this toolkit; scene timing basics live in
`skills/magnifito-storyboard/reference/motion-timing.md`.

## What our renderers can do with a beat

- **HyperFrames adapter**: each scene card animates in (elements fade and rise one after
  another, timed by the brand `tempo`), holds, and fades out over the last 0.25 s before a hard
  cut. The entrance finishes within 45% of the scene. The beat lives in where the cuts fall.
- **Motion engine**: each scene is a spring-animated clip; clips join on a hidden centred-dot
  cut. Internal timing is set by the recipe, not by the beat.
- **Both** write a silent audio bed. Music and effects are mixed afterwards, for example with
  the measured sound pass (`mgvideo sfx <video> --cues cues.json --out dir`).

So a "beat-locked reel" here means: scene boundaries on a beat grid, `timing_authority: "music"`
in brief and plan, and a music track whose bars line up with those boundaries. Matching the
track to the picture is a manual check.

## The beat grid

- One beat = 60 / BPM seconds; one bar = 4 beats. Renders run at 30 fps.
- Write every boundary as a beat count first, then convert: frame = round(beats × 60 / BPM × 30).
  Convert absolute boundaries, never per-scene lengths, so rounding cannot drift.

| BPM | Beat | Frames per beat | Bar |
|---|---|---|---|
| 90 | 0.667 s | 20 | 2.667 s |
| 100 | 0.6 s | 18 | 2.4 s |
| 120 | 0.5 s | 15 | 2.0 s |
| 128 | 0.469 s | 14.06 (round per boundary) | 1.875 s |
| 150 | 0.4 s | 12 | 1.6 s |

- **Cuts on beats, sections on whole bars.** Hook, each new idea and the end card start on a
  bar line. Cuts inside a section may fall on any beat.
- **Pick the film length in whole bars.** At 120 BPM, 16 s is 8 bars; 15 s is 7.5 bars and ends
  mid-bar. Set `brief.duration_seconds` to the bar-aligned length, or let the last bar ring out.
- **Hits on the grid.** Sound events go on a beat, half beat or quarter beat (0.5 / 0.25 /
  0.125 s at 120 BPM). Put them in `audio_events` as scene-local `start_frame`.
- **Recipe ranges still apply.** At 120 BPM, `motion-kinetic-type` (2.5–6 s) takes 6, 8, 10 or
  12 beats; `motion-logo-reveal` (1.8–5 s) takes 4, 6, 8 or 10.

## Words on screen

- **Short, strong words.** One or two lines per headline. `kinetic-typography` wraps at 26
  characters per line; `motion-kinetic-type` takes up to 24 words and 3 lines landscape,
  5 portrait. Aim well under the limit.
- **Size.** Headlines at least 60 px for full-screen viewing, 90 px for social feeds; body at
  least 20 px. Phone test: the key line still reads at 360 px wide (manual check on a still).
- **Safe area.** Keep content 60 px from every edge unless the crop is deliberate.
- **One accent per line.** Colour one word, or nothing. The brand `accent` means "this is the
  point"; if every word is accented, none is.
- **Three type roles at most.** Display for headlines, one text face, one mono for labels.
  Mono labels are decoration; anything the viewer must read goes big.
- **Timing.** Word stagger ~0.09 s; typing ~0.035 s per character. Hold each readable state
  1 s + 0.25 s per word beyond three, and the final line at least 2 s.

## Taste numbers for judging a render

| Topic | Default |
|---|---|
| Arrival curve | `(0.16, 1, 0.3, 1)`, fast in then settle |
| Exit curve | `(0.6, 0, 0.9, 0.35)`, leaves fast |
| Move between states | `(0.65, 0, 0.35, 1)` |
| Exit length | about half the entrance |
| List and chip stagger | 0.2–0.25 s on a reel |
| Transition length | 0.45–0.6 s |
| Hero moments | one per film; build to it |
| Frame 0 | never black or empty (it is the muted-autoplay thumbnail) |

Anti-patterns: everything fading in at once, every scene the same length, text moving while it
is read, more than one focal point, linear easing on anything that starts or stops.

## Reel structure

1. **Decide the emphasis first.** The lead message takes about 35–40% of the runtime; intro,
   index and end card share the rest. Write the split down before building scenes.
2. **Every scene has a mechanism.** The words name the idea; the visual proves it (a bar grows,
   a card becomes a control, a feature grid fills). A scene that is only words is a hook or
   an end card, not the middle of the reel.
3. **Facts stay exact.** Every number on screen comes from `claims.json` with its scope; see
   `skills/magnifito-storyboard/reference/script-and-shot-plan.md`.
4. **Vary the joins.** Never three of the same kind of change in a row. Contrast pace:
   fast, hold, fast. Hard cut plus impact is for section changes only.

## Sound rules (for the mix after render)

- **No noise whoosh on every cut.** Leave about half the cuts silent; the downbeat carries them.
- **Never the same cue twice in a row.** Keep a big impact for the one hero moment (upstream
  used about five in 84 s).
- **Tie hits to the picture.** A tick per word or row, a ping when a value lands.
- **Gain hierarchy** (maps to `audio_events[].volume`): hero hit 0.25–0.35, support 0.08–0.2,
  pad around 0.03.
- **Loudness.** Our render settings default to −16 LUFS and −1 dBTP. Upstream masters social
  reels at −14 LUFS; broadcast uses −23 LUFS. Follow the brief.
- **You cannot hear it.** Inspect `mgvideo waveform <media>` and confirm hits sit on or just
  after a beat (manual check; the image has no beat lines). Say in the report that the audio
  was checked visually only.

## HyperFrames pitfalls that apply to our adapter

- **Fonts come from the brand profile.** Text is rasterised with fontconfig from
  `fonts[].file_path`. A missing file stops the render, but a family with no `file_path` is
  looked up in system fonts and silently substituted if absent. Check a still for the right
  face (manual check).
- **Cyrillic needs a verified font.** With `language: "bg"`, validation fails unless a font has
  `supports_cyrillic: true`.
- **Recipe motion is not animated.** `stagger_delay_ms`, `scale_overshoot` and the
  `brand-title` crossfade are drawn as a resting state; scenes join with hard cuts. If a reel
  needs movement inside scenes, use the motion engine.
- **Check the final file, not a preview.** Pull stills from the rendered video with
  `mgvideo thumbnail <target> -t <seconds>`, 0.3 s after each boundary so the frame is settled.
- **Transparent output** needs `webm` or `mov_prores`; H.264 cannot carry alpha.
- **One frame rate.** The plan's `duration_frames / duration_seconds` must be the same for every
  scene; the render encodes at 30 fps and logs a note when the plan says otherwise.

Upstream also lists GSAP rules for hand-built HyperFrames compositions (one paused timeline,
values on both sides of `fromTo`, inline CSS, no tweens on `.clip` visibility). Our adapter
writes `composition.html` as a contract artifact without GSAP and does not capture it, so
those rules do not apply today.
