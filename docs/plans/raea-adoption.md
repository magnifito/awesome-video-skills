---
title: "raea adoption: quality floor, checks and craft guides"
summary: "What Magnifito takes from shinyobjectz/raea (FSL engine, ideas only) and raea-skills (Apache-2.0, vendored as data): a P0-P3 validate report, ffmpeg and DOM-measured checks, a reconciled quality floor, craft modes and verbs, a blind judge loop, HyperFrames determinism and skill lint"
kind: plan
status: draft
updated: 2026-11-10
---

# raea adoption: quality floor, checks and craft guides

## Goal

[shinyobjectz/raea](https://github.com/shinyobjectz/raea) (the "Render Anything Engine") is a
Rust/Bevy GPU renderer for React compositions, with agent skills in
[shinyobjectz/raea-skills](https://github.com/shinyobjectz/raea-skills). Magnifito does not adopt
the engine. It adopts what raea has that Magnifito lacks today: a measured quality floor, a
ranked check report, craft guides per video type, and a blind review loop.

Today `mgvideo validate` checks file integrity, dimensions, fps, audio presence, input hashes,
claims wording and one fixed 9:16 safe-zone rectangle. It measures no loudness, pixels, contrast,
text placement or captions (`skills/magnifito-deliver/reference/render-qa.md`, section 0). Most of
this plan closes that gap.

## Sources and licences

Surveyed 2026-11-09:

| Repository | Commit | Licence | Use |
|---|---|---|---|
| `shinyobjectz/raea` | `d6f41c605ab71275162050cd08632cb56bd00e8a` | FSL-1.1-ALv2 | Ideas only. No code or text copied, nothing vendored |
| `shinyobjectz/raea-skills` | `c507860150995eb7c22ef9db23dee636c832428a` | Apache-2.0 | Selected files vendored as data |

- FSL-1.1-ALv2 allows any use except a product that competes with raea, and becomes Apache-2.0
  two years after each release. Magnifito is a video toolkit, so the safe reading is that it may
  compete. Algorithms and thresholds described below are reimplemented from their description,
  in TypeScript, on ffmpeg and Playwright. No raea source file is copied, ported or translated.
- raea's `sdk/guides/craft/` text has no separate licence, so it falls under FSL. The same guides
  are published in raea-skills under Apache-2.0 (`skills/raea/craft/`). Only the raea-skills copy
  is vendored.
- raea-skills `craft/NOTICE` credits the method to Impeccable (pbakaus/impeccable, Apache-2.0).
  Both attributions go in `notices/THIRD_PARTY_NOTICES.md`.
- raea's HyperFrames port (`sdk/ui/src/html*.ts`) derives from HyperFrames (Apache-2.0), which
  Magnifito already tracks. Improvements are taken from HyperFrames upstream, or reimplemented
  from description, never from raea's port.
- No upstream code runs. raea-skills files are data, like `vxi-motion-tools`.

## Phase 0: register and vendor

1. Add `raea` to `registry/upstreams.json` as a watchlist entry: licence `FSL-1.1-ALv2`, role
   "quality checks and craft reference, ideas only", not vendored. `sync_issues.ts` then opens an
   `upstream-update` issue when it moves.
2. Add `raea-skills` at `c507860…` and vendor, following `docs/engineering/upstream-sync.md`, into
   `vendor/raea-skills/c507860150995eb7c22ef9db23dee636c832428a/` with an `included_paths` list:
   - `LICENSE`, `README.md`
   - `skills/raea/craft/` (floor, rubric, ROUTER, modes, verbs, NOTICE)
   - renderer-neutral motion guides: `skills/raea/motion/{timing,animating,words,sound,music,footage,placement,layout,delivery}.md`
   - `skills/raea/reference/platforms.md`
   - `skills/raea/3d/prompts.md` (the judge loop only; the rest of `3d/` is Bevy-specific)
   - `docs/RULES.md`, `docs/TREE.md`
3. Approve it in `registry/approved.lock.json` with file hashes, and add the Apache-2.0 and
   Impeccable notices.

Done when `npm run registry:check` passes with the new entries.

## Phase 1: decide the floor

raea's floor and Magnifito's render QA disagree. Decided 2026-11-10; the checks in later phases
enforce these values:

| Rule | Magnifito today | raea floor | Decision |
|---|---|---|---|
| Loudness | -16 LUFS, -1 dBFS | -14 LUFS ±1, true peak ≤ -1 dBTP | Keep -16 as default; add per-platform targets; measure true peak, not sample peak |
| Minimum text size | frame height / 60 (18 px at 1080) | 60 px at 1080 wide | 60 px at 1080 wide for 9:16 social text; keep the smaller floor for 16:9 labels |
| Contrast | 4.5:1 body, 3:1 large (manual) | 3:1 against the pixels behind | Measure 3:1 as P1, 4.5:1 for body text as P2 |
| Freeze | 2.5 s warn | 3 s P2, 6 s or half the video P1 | Take raea's tiers |
| Reading time | none | max(0.3 s × words, 1 s) | Adopt |
| Flashes | `brand.json` bans neon flashing | ≤ 3 flashes in any second (WCAG 2.3.1) | Adopt |

Safe zones: raea-skills has two tables that disagree (`craft/floor.md` in pixels, TikTok bottom
320 px or 16.7 %; `reference/platforms.md` in percent, TikTok bottom 25 %). Take the pixel table,
check it against each platform's current guidance, and store it in `packages/contracts` as a
schema keyed by platform and aspect (9:16 TikTok, Reels, Shorts, generic; 4:5; 1:1; 16:9).

Write the result as `skills/magnifito-deliver/reference/floor.md`, in our own words, with
`render-qa.md` pointing to it. The floor-vs-taste test from raea-skills `docs/RULES.md` decides
what goes in: a rule belongs on the floor only if two good editors would not disagree.

## Phase 2: ranked validate report

Change `mgvideo validate` output to ranked issues:

- Each issue is `{ rule, severity: P0|P1|P2|P3, at_s?, says, fix }`; passed checks are listed as
  `ok` lines.
- Exit code 1 on any P0 or P1, 0 otherwise, 2 when validate refuses to run (missing run, missing
  tools).
- `--json` writes `{ file, issues[], passed[] }`. The existing checks map to P0 (integrity,
  dimensions, inputs changed, claims) or P1.
- Taste overrides per project (`validate` section in the project config: text hold, margins,
  loudness target, still max), so a project can loosen a rule on purpose and the report says so.

Done when existing validate tests pass with the new shape and the showcase suite still validates
every committed video.

## Phase 3: ffmpeg checks

Each needs only ffmpeg and runs on any final file, so it works for every renderer.

- **Loudness**: `ebur128=peak=true`; integrated LUFS and true peak against the Phase 1 target. P1.
- **Freeze**: `freezedetect=n=-60dB:d=3`; P2 from 3 s, P1 from 6 s or half the runtime.
- **Black or empty spans**: `blackdetect` over 0.5 s (already a manual command in render QA).
- **Dead stop**: a steady music bed that cuts out without a fade. 10 ms RMS; after a steady second
  (spread under 3 dB), a single drop of 12 dB or more that stays 24 dB down for 300 ms. P1.
- **Flash**: luminance swings per one-third window of a downscaled frame; more than 3 flashes in
  one second is P1. Size L: it needs per-frame pixel reads, so it comes after the others.
- **Bed under voice** (needs word times): in 6 s windows the bed must sit about 12 dB or more
  under the voice. P2.

## Phase 4: text manifest from HyperFrames

raea checks text because its renderer records every text box per frame. HyperFrames renders in
Playwright, so the adapter can record the same:

1. During render, at each sampled frame (every frame for short films, every 0.1 s otherwise),
   read every visible text node: text, `getBoundingClientRect`, computed colour, font size,
   opacity. Write `text-manifest.json` beside the render result and hash it into the run.
2. Checks over the manifest:
   - **Clipped** (P0): a text box more than 1 px outside the frame.
   - **Safe zone** (P1): a text box inside the platform zone for the delivery format. Replaces
     today's fixed card-rectangle check.
   - **Too small** (P1): below the Phase 1 floor.
   - **Reading time** (P2): on screen shorter than max(0.3 s × words, 1 s), unless narration
     speaks it.
   - **Contrast against pixels** (P1): crop the final video at the middle of each text run, take
     the half of the pixels least like the text colour, take their median luminance, compute the
     WCAG ratio against the text colour.
   - **Overlap** (P2): two text boxes both at least 30 % opaque overlapping more than 20 % of the
     smaller one (the rule already in render QA, now measured).
3. Face cover (text over more than 8 % of a face box) waits for face detection; the object
   cut-out work may supply it.

The `html` and `motion` adapters can emit the same manifest once HyperFrames does.

## Phase 5: quick check while editing

`mgvideo check --quick <page>` renders three stills (¼, ½, last frame), runs the Phase 4 text
rules on them, and prints nothing when clean. Ship it as a `PostToolUse` hook in the plugin (not
in any project settings file), matching saves of composition HTML, so Claude sees text problems
right after an edit.

## Phase 6: words, captions and cutting by lines

Magnifito has no speech recognition (`packages/media/src/caption_words.ts`). Several raea rules
need word times.

1. **Local transcription**: add an optional `mgvideo transcribe` that writes `words.json`
   (word, start, end in ms). Candidates: parakeet-mlx on Apple Silicon (check Bulgarian support
   in the multilingual model first) and whisper.cpp as the cross-platform fallback. Installed
   into its own venv by `mgvideo doctor --install`, never at render time. Zero cost, so the media
   budget is untouched.
2. **Caption grouping**: break after 3 words, at punctuation, or at a gap over 8 frames; hold
   8 frames after the last word.
3. **Cue drift** (P1): a caption appears more than 0.15 s after, or 0.25 s before, its first word.
4. **Names on screen**: every brand or product name the narration says (from `brief.json` and
   `claims.json`) is visible while said. P2.
5. **Cut by lines**: `mgvideo edit cut --keep lines.txt` matches each kept line to the
   transcript word by word, falling back to the best window with 70 % or more of the words (and
   a note). Pad with min(0.6 × gap, 0.12 s) before and min(0.7 × gap, 0.22 s) after, 0.35 s
   after the last clip. Within 0.25 s of a scene change, move the cut one frame off it. Writes
   the dual-timeline mapping `magnifito-edit` already uses.

## Phase 7: craft guides in the skills

From the vendored raea-skills `craft/` and `motion/`, rewritten for mgvideo the way
`render-qa.md` was:

- **Modes to skills**: pitch (hook within 2 s, one belief, one proof, end card at least 2 s, works
  muted) into `magnifito-promo`; explain (one project through one loop, 25–45 words per scene)
  into `magnifito-product-demo`; story (camera keeps moving through cuts, cut to the music's
  energy, a poster frame) into `magnifito-video` routing. Keep each mode's failure table
  (symptom, why, fix).
- **Refuse list** into `magnifito-storyboard`: template captions (white bold, one yellow word),
  the same move on every beat, a whoosh on every entrance, cutting at a constant tempo, effects
  stacked, glow on everything.
- **Verbs** (critique, polish, quieter, bolder, distill, clarify, retime, recut, regrade, remix,
  …): one reference file per skill that lists the moves it serves, so a review note maps to a
  named move with Assess, Decide, Change, Verify.
- **Motion numbers** into `packages/motion` recipes and `magnifito-storyboard/reference/motion-timing.md`:
  rise 30 px over 6 frames, pop 0.6 → 1.08 → 1 over 8 frames, slam 1.3 → 0.96 → 1, slide 30 px
  over 7 frames, push-in 1 → 1.04 over 90 frames, settle with ease-out-cubic, no reflex bounce.
- **Audio numbers** into `magnifito-audio`: bed 15–20 LU under the voice, duck 10–14 dB with
  40 ms attack and 300–400 ms release, 1–1.4 s fade at the end of a bed, 12 ms fades at cuts,
  never boost a near-silent take by more than 3 dB.
- **Delivery naming** into `magnifito-deliver`: cutdowns are their own edits; files named
  `name-9x16-15s.mp4`; a new version renders beside the old file (`-v2`), never over it.

## Phase 8: blind review loop

A reviewer subagent that sees only frames (Phase 2 sheets) and the brief, never the code or the
builder's notes:

- First a blind read ("what is this, who is it for"), then 0–10 scores on a fixed set of axes,
  then defects as JSON `{ tile, where, wrong, fix, level }`.
- Pass is decided in code, not by the model: no blocking defect, lowest score at least 6, mean at
  least 7, two passing rounds in a row.
- Change one thing per round. Stop when two rounds gain under 1 point or the same defect repeats;
  cap at 8 rounds.
- The rubric's P0–P3 levels match Phase 2, so the judge's defects and the measured checks land
  in one report.
- Before it can block a delivery, calibrate it: at least 10 rounds compared with a person's
  verdict, 80 % agreement. Until then it is advisory.

Lives in `magnifito-deliver` as a documented loop; an `evaluations/` suite holds the calibration.

## Phase 9: render determinism in the HyperFrames adapter

- Per frame, reseed `Math.random` from (seed, frame) and pin `Date.now` and `performance.now` to
  the frame time from a fixed epoch. This turns the grep in render QA section 1 into a guarantee.
- A font alias table (Helvetica, Arial, SF to Inter; Georgia, Times to a bundled serif; Menlo to
  a bundled mono) using fonts with Cyrillic coverage. raea keeps only Latin subsets; Magnifito
  must not.
- Collect page warnings (no root timeline, a script that threw, a font that fell back) into the
  render result, shown by `validate` as P1.
- Check HyperFrames upstream for each of these first; adopt from there when it already exists.

## Phase 10: tooling ideas

- **Skill lint** in `tools/packaging/packager.ts`: `name` matches the folder and `[a-z0-9-]`,
  at most 64 characters; `description` at most 1024; a `tested-against` field per skill checked
  against `mgvideo --version`; every `mgvideo` verb a skill names exists in the CLI help; an
  opinion guard (warn on hard-coded hex colours and "always use", "the best" in skill text, with
  an `opinion-ok: <reason>` escape). Scan reference files too, not only `SKILL.md`.
- **CLI help snapshot**: commit `mgvideo --help` output per command so a CLI change shows up in
  review as a diff, and skills that name a removed flag fail lint.
- **Coverage ladder** (raea-skills `docs/TREE.md`): rate each skill D0 (named) to D4 (an
  evaluation shows a fresh agent doing it from the skill alone). Track in `registry/capabilities.json`.
- **Offline switch**: `MGVIDEO_OFFLINE=1` refuses every network fetch while disk keeps working.
- **Generation ledger**: each generated asset (voice, image, SFX) cached by a key of prompt,
  seed, model and parameters, with its cost in cents, feeding `mgvideo cost`.
- **Local foley**: Stable Audio Open Small for sound effects, run locally through its own script
  like `tools/voice/`. The Stability licence is already accepted.

## Not adopted

- The engine itself: Rust, Bevy, GPU compositing, games, 3D, physics, the React runtime. It is
  FSL and a different architecture.
- raea's rule against generated images and video. Magnifito's AI presenter is generated and
  labelled; that rule is raea's policy, not a craft rule.
- Content Credentials: raea's signer is a closed hosted service. Revisit C2PA separately.
- raea's Latin-only font subsets.
- raea's hosted generation providers.

## Order and size

| Phase | Size | Depends on |
|---|---|---|
| 0 Register and vendor | S | none |
| 1 Floor decisions | S | 0 |
| 2 Ranked report | S | none |
| 3 ffmpeg checks | M | 1, 2 |
| 4 Text manifest | M | 1, 2 |
| 5 Quick check hook | S | 4 |
| 6 Words and cutting | M–L | 2 |
| 7 Craft guides | M | 0, 1 |
| 8 Blind review | M | 2, 7 |
| 9 Determinism | M | none |
| 10 Tooling | S–M | 0 |

Start with 0, 1 and 2, then 3 and 4. They turn the manual render QA into measured checks.

## Done when

- `mgvideo validate` reports ranked issues and fails on P0 and P1.
- Loudness, freeze, black, dead stop, clipped text, safe zone, size, reading time and contrast are
  measured, and every showcase video passes or carries a documented override.
- The floor is one file the skills point to, with no conflicting numbers left in other references.
- `npm test`, `npm run lint:docs` and the showcase suite pass.
