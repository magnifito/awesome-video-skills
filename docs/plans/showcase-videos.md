---
title: Showcase videos and GitHub Pages site
summary: "Definition of the Magnifito showcase: every video type, visual recipe, format, finishing command and variation the toolkit makes, as reproducible example videos checked by a test suite and shown on a GitHub Pages site"
kind: plan
status: draft
updated: 2026-11-04
---

# Showcase videos and GitHub Pages site

## Goal

The showcase proves what the toolkit makes. Every capability that changes what a viewer sees or
hears has at least one short example video. Each example is a reproducible recipe: the prompt
for Claude Code, the exact commands, and the config files they read. The videos promote the
package, run as end-to-end tests, and appear on the GitHub Pages site
(https://magnifito.github.io/awesome-video-skills/). They are not published on magnifito.com.

Magnifito is the demo client. On-screen text is English, except where language is the point.

## Coverage model

The showcase covers five axes. Each axis is one section on the site and one folder prefix.

| Section | Prefix | One example per | Question it answers |
| --- | --- | --- | --- |
| Video types | none | workflow / skill job | What kinds of video can I make? |
| Style gallery | `s` | visual recipe in `styles/recipes/` | What can each scene look like? |
| Formats and finishing | `f` | finishing command that changes picture or sound | What can I do to a finished video? |
| Variations | `v` | input that changes the same film | What changes when I change one setting? |
| Behind the clip | (on each card) | review artifact | What do I get besides the MP4? |

Rules that define "complete":

1. Every recipe in `styles/recipes/*.json` has exactly one `s` clip.
2. Every `mgvideo` command in the "shown" list below appears in at least one recipe's commands.
3. Every Magnifito skill except the router `magnifito-video` is the `skill` of at least one
   example.
4. Every main example has a distinct `type`.

The showcase suite checks rules 1–4 (see "Test contract").

## Section 1: Video types (10)

| Id | Type | Skill | Engine / commands | Footage | Status |
| --- | --- | --- | --- | --- | --- |
| 01-branded-promo | Branded promo | magnifito-promo | hyperframes, `render`, `sfx` | none | done |
| 02-product-demo | Product demo | magnifito-product-demo | hyperframes, `render`, `sfx` | none | done; skill to change from magnifito-promo |
| 03-talking-head-edit | Talking-head edit | magnifito-edit | `concat`, `inspect` | synthetic | done |
| 04-commerce-variants | Commerce variants | magnifito-variants | `batch`, `render` | none | done |
| 05-multilingual-explainer | Multilingual explainer (EN + BG) | magnifito-variants | hyperframes, `render` | none | done |
| 06-motion-graphics | Motion graphics | magnifito-promo | motion, `render` | none | done |
| 07-broll | B-roll over a speaker | magnifito-broll | `broll` | synthetic | done |
| 08-sound-pass | Sound pass | magnifito-audio | `sfx` | none | done |
| 09-object-cutout | Object cut-out | magnifito-edit | `separate` | synthetic | done |
| 10-storyboard-animatic | Storyboard animatic | magnifito-storyboard | `plan`, `storyboard`, `montage` | none | new |

The router skill `magnifito-video` takes every prompt first, so it has no clip of its own; each
README says the prompt goes through it. `magnifito-brand` owns v02-brand-swap and
`magnifito-deliver` owns f24-size-budget; both also add "Behind the clip" artifacts.

## Section 2: Style gallery (17, one per recipe)

| Id | Recipe | Engine | Status |
| --- | --- | --- | --- |
| s01 | cinematic-title | hyperframes | done |
| s02 | kinetic-typography | hyperframes | done |
| s03 | product-reveal | hyperframes | done |
| s04 | saas-interface-tour | hyperframes | done |
| s05 | retail-card | hyperframes | done |
| s06 | newsletter-promo | hyperframes | done |
| s07 | milestone-reveal | hyperframes | done |
| s08 | model-comparison | hyperframes | done |
| s09 | isometric-feature-grid | hyperframes | done |
| s10 | interview-speaker-card | hyperframes, transparent over footage | done |
| s11 | broll-lower-third | hyperframes, transparent over footage | done |
| s12 | broll-stat-callout | hyperframes, transparent over footage | done |
| s13 | motion-kinetic-type | motion | new |
| s14 | motion-card-morph | motion | new |
| s15 | motion-bars-chart | motion | new |
| s16 | motion-logo-reveal | motion | new |
| s17 | brand-title | hyperframes | new |

Hyperframes clips animate: elements enter with a stagger set by the brand `tempo`, some recipes
drift the camera, and cards fade before a cut (`adapters/hyperframes/animate.ts`). Motion clips
are spring-animated with motion blur. 06 stays as the combined motion-graphics film; s13–s16 show
each motion recipe alone.

## Section 3: Formats and finishing (24)

Each clip applies one command to a committed showcase video or to synthetic footage. Where the
change is easier to see side by side, the clip shows before and after (`multicam`).

| Id | Group | Command | Source | Status |
| --- | --- | --- | --- | --- |
| f01-reframe-vertical | Format | `reframe` 9:16 (crop) | 03 | done |
| f02-reframe-square | Format | `reframe` 1:1 (fit) | 06 | done |
| f03-blur-bg | Format | `blur-bg` | f01 | done |
| f07-native-vertical | Format | `render --format 9:16` | 01 project | new |
| f08-smart-crop | Format | `smart-crop` 4:5 | 03 | new |
| f09-letterbox | Format | `matte` 2.39:1 | 06 | new |
| f04-color-grade | Look | `grade` warm-vibrant, before/after | 03 | done |
| f10-vignette | Look | `vignette` | 03 | new |
| f11-glitch | Look | `glitch` | 06 | new |
| f12-title-card | Text | `title` | 03 | new |
| f05-lower-third | Text | `lower-third` | 03 | done |
| f06-seamless-loop | Time | `loop` | 06 | done |
| f13-speed | Time | `speed` | 03 | new |
| f14-rewind | Time | `reverse` | 06 | new |
| f15-freeze-end | Time | `freeze` | 01 | new |
| f16-picture-in-picture | Composite | `pip` | 02 + 03 | new |
| f17-multicam | Composite | `multicam` quad-2x2 | 03, f04, f10, f13 | new |
| f18-chromakey | Composite | `chromakey` | synthetic green-screen footage | new |
| f19-review-watermark | Review | `watermark` | 01 | new |
| f20-safezone-guide | Review | `safezone` | f07 | new |
| f21-redact | Review | `mask` | 02 | new |
| f22-dialogue-cleanup | Audio | `declick`, `noise-gate`, `eq`, `compress-audio` | synthetic noisy speech | new |
| f23-waveform | Audio | `waveform` as a picture over the f22 sound | f22 | new |
| f24-size-budget | Delivery | `optimize` to a fixed size | 01 | new |

Commands not shown, because they change nothing a viewer can see or hear in a short clip:
`framerate`, `deinterlace`, `proxy`, `resample`, `channel-map`, `pan`, `sanitize`, `concat`
(used inside 03), `thumbnail` (makes every poster), `inspect` (used in 03). The CLI tests cover
them.

## Section 4: Variations (3)

Each variation renders the same film twice with one input changed, then joins the two renders
side by side with `multicam` so the difference is visible.

| Id | Changes | Same film | Shows |
| --- | --- | --- | --- |
| v01-tempo | `motion_preferences.tempo` calm vs punchy, `camera_style` static vs drift | s01 | The hyperframes animation follows the brand |
| v02-brand-swap | `brand.json`: Magnifito vs a fictional second brand (colours, font, logo) | 01 | One brief, any brand |
| v03-engine | `engine` hyperframes vs motion | one storyboard | The two renderers on the same plan |

Language (EN vs BG) is covered by 05. Aspect ratio is covered by f01, f02 and f07.
Transparent output is covered by s10–s12 and 07.

## Behind the clip

Each site card can link to the review artifacts its run produced, so the skills that make no
video of their own are still shown:

- `magnifito-storyboard`: the storyboard contact sheet from `mgvideo storyboard` (10).
- `magnifito-brand`: the `brand.json` with its contrast and font checks.
- `magnifito-deliver`: the `mgvideo validate` result and `mgvideo chapters` output for the
  size-budget copy of 01 (f24).

Decision: artifacts are committed. A recipe lists them in `artifacts` (label and the path its
commands wrote); `render.ts` copies each to `showcase/artifacts/<id>/`, the README links them
under "Behind the clip", and the site copies them next to the videos. Each artifact is at most
2 MiB.

## Layout

- `showcase/<prefix>NN-<slug>/`: one self-contained project per example.
- `showcase.json`: the recipe (prompt, commands, output, poster time, expected spec, footage
  flag, credits). Schema: `ShowcaseMetaSchema` in `showcase/lib.ts`.
- `README.md`: generated from `showcase.json`; never edited by hand.
- `showcase/render.ts`: runs each recipe's commands in order and writes
  `showcase/videos/<id>.mp4` (H.264 CRF 26, faststart) and `<id>.jpg`.
  `npm run showcase [-- <id>]`.
- `site/build.ts` and `.github/workflows/pages.yml`: the GitHub Pages site, one section per
  prefix.

## Reproducibility rule

`render.ts` runs exactly the commands in `showcase.json`, so the recipe cannot drift from the
committed video. Commands are plain argv: no pipes, redirects, variables or globs. Allowed
programs are `mgvideo`, `ffmpeg` and `node`. Generated files go under `work/` or `runs/`; every
other file a command names is committed.

## Test contract

`evaluations/suites/showcase.ts` checks:

- every recipe is valid, its README matches it, and its inputs are committed;
- every committed MP4 matches `expect` (size, duration, audio, yuv420p, faststart) and is at
  most 6 MiB;
- coverage rules 1–4 from "Coverage model";
- every listed artifact is committed under `showcase/artifacts/<id>/` and is at most 2 MiB;
- with `MGVIDEO_TEST_SHOWCASE=1`, a full re-render.

`PROJECT_ID` and `SECTIONS` in `showcase/lib.ts` gain the `v` prefix.

## Constraints

- No camera footage. Footage is synthetic, made by the recipe, and marked
  `synthetic_footage: true`.
- Audio is CC0 or generated. Mixkit audio is never used.
- Each clip is 4–15 s. Each MP4 stays under 3 MB where possible; the suite fails above 6 MiB.
  At about 54 clips the videos folder grows from 22 MB to about 45 MB.
- One presenter name ("Mira") across all talking-head clips.

## Build order

1. Suite coverage checks and the `v` prefix (fails until the new clips exist).
2. s13–s17 (no new toolkit code).
3. f07–f24, grouped by source video.
4. 10-storyboard-animatic and the 02 skill change.
5. v01–v03.
6. Behind-the-clip artifacts.
