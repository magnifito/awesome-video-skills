---
title: "Motion engine (Barty-Bart motion-graphics integration)"
summary: "Vendor Barty-Bart/motion-graphics at 3d83d98 and add a motion renderer, recipes, transparent B-roll, sound effects and object separation"
kind: plan
status: draft
updated: 2026-11-04
---

# Motion engine (Barty-Bart motion-graphics integration)

## Goal

Make the toolkit produce animated motion graphics of the quality of
[Barty-Bart/motion-graphics](https://github.com/Barty-Bart/motion-graphics) (MIT): spring-driven
shapes that never cut, kinetic type, motion blur, transparent B-roll panels, beat-placed sound
effects, and subject separation. Today every renderer (`hyperframes`, `html`) outputs static SVG
cards joined by crossfades.

## Source

- Upstream `barty-motion-graphics` at commit `3d83d987d658601d8a1269eb691622bdcd427335`
  (already the `observed_commit` in `registry/upstreams.json`; current upstream `main`).
- Licences: code MIT; Geist fonts OFL-1.1; icon paths Lucide ISC; bundled sounds CC0-1.0.
  Sounds that upstream fetches from Mixkit at runtime are **not** redistributable: never copy,
  cache into the repo, or ship them.

## Phase 0: vendor and approve

1. Copy upstream `LICENSE`, `README.md` and `skills/` unchanged to
   `vendor/barty-motion-graphics/3d83d987d658601d8a1269eb691622bdcd427335/`. Leave out `docs/`
   (24 MB of demo GIFs).
2. Record the commit as approved in `registry/approved.lock.json` with a SHA-256 for every
   vendored file, set `approved_commit` in `registry/upstreams.json`, and update the
   `modifications` text in `registry/provenance.json`.
3. Vendored files are data. Code under `packages/` reads them (motion.js, base.css, fonts,
   sounds) by path; nothing executes vendored Python or shell scripts.
4. The Claude plugin discovers skills only under `skills/`, so vendored `SKILL.md` files are
   never loaded as skills.

## Phase 1: `motion` renderer

New package `packages/motion/src/`:

| Module | Role |
|---|---|
| `engine.ts` | TS port of upstream `build.py`: wraps a clip fragment with vendored `motion.js` and `base.css` into one self-contained HTML page. Embeds brand fonts from `brand.json` (`file_path`) as base64 `@font-face`; falls back to vendored Geist. |
| `capture.ts` | TS port of `render.js` and `beats.js` using `playwright-core` launched on the system Chrome (`findChrome()` in `packages/media/src/proc.ts`), so no browser download. Each frame is captured at 4 sub-frames across a 180° shutter and blended with ffmpeg `tmix` (motion blur). Opaque clips encode to H.264; `bg:null` clips encode to ProRes 4444 `.mov`. `stills()` renders a contact sheet at given times. |
| `recipes/*.ts` | One function per motion recipe: `(scene, ctx) => fragment`. Uses brand colours and fonts. |

New adapter `adapters/motion/index.ts` implementing `VideoRendererAdapter`, registered as engine
`motion` in `adapters/registry.ts` and in the `engine` enum in `packages/contracts`. It renders
one clip per scene, joins them in order (the `TransitionEngine` or hard cuts, per recipe), and
applies the same audio path as the HyperFrames adapter. `validate()` fails with a clear message
when Chrome or `playwright-core` is missing. `mgvideo doctor` reports both.

Recipes (`styles/recipes/*.json`, `"engines": ["motion"]`):

| Recipe | Based on | Scene fields used |
|---|---|---|
| `motion-kinetic-type` | `explainer-high-energy` | `on_screen_text` words, timed across the scene, springs and shape transitions |
| `motion-card-morph` | `motion-broll` pill → card → control | headline, up to 4 rows, optional cursor click |
| `motion-bars-chart` | `motion-broll` rows/bars on words | up to 6 labelled values from claims |
| `motion-logo-reveal` | — | logo asset, tagline |

Determinism: rendering the same frame twice must give byte-identical PNGs.

Skills: `magnifito-promo` and `magnifito-storyboard` learn the `motion` engine and recipes.
New reference `skills/magnifito-promo/reference/motion-engine.md`, adapted from upstream
`engine-api.md`, teaches custom clip authoring.

## Phase 2: transparent B-roll on footage

- `motion` clips with `bg:null` render to ProRes 4444 (alpha).
- `mgvideo broll compose <plan.json> <out.mp4>`: TS port of upstream `composite.py`. Overlays
  clips on the source video at `in`/`out`, holds the last frame, keeps original audio.
- `magnifito-broll` skill: plan format (`plan.json`), panel clips, compose step.
- Plan contract `BrollPlanSchema` (`packages/contracts/src/broll.ts`): clips have `in`/`out`,
  `kind` (`full` | `panel`), and either `recipe` + `scene` or a `fragment`. `in < out`, no
  overlaps, `out` within the probed source, and every path is confined to the plan directory
  with `safeJoin` (`packages/media/src/broll.ts`).
- `mgvideo broll render <plan.json>` (`packages/motion/src/broll.ts`) renders each clip at the
  source size and fps. `motion-card-morph` and `motion-bars-chart` take a panel safe area
  (`RecipeContext.panel`): the camera centres on it and is clamped so the shape stays inside.
- `mgvideo broll check` validates a plan; `mgvideo broll words <srt|vtt>` ports upstream
  `words.py` (caption cues to estimated word times). The toolkit has no speech recognition.
- Fixture `fixtures/broll-demo/` (generated 8 s stand-in source) and suite
  `evaluations/suites/broll-compose.ts`.

## Phase 3: sound effects

- Sound library read from the vendored `skills/sound-effects/sfx/` (CC0) through its manifest.
- `mgvideo sfx <video> --cues cues.json [--music track] --out dir`: places effects on cue
  times, snaps to the music beat grid when music is given, measures loudness, writes a
  `CREDITS.txt` and a report. Beat tracking and spectral checks run in a Python helper
  (`librosa`) inside a managed venv created by `mgvideo setup sfx`; the TS side never shells
  through a string.
- `magnifito-audio` skill documents the pass. Mixkit runtime fetches stay off.

## Phase 4: object separation

- `mgvideo separate <video> --points x,y[,label] ... --start N --end M --out dir`: SAM 2
  (`transformers`) in a managed venv created by `mgvideo setup separate`. Picks the model by
  hardware (CUDA ≥12 GB large, Apple Silicon or smaller GPU base-plus, CPU tiny) and outputs a
  green-highlight preview, per-frame masks and an alpha `.mov` cut-out.
- Model weights download on first use into the user cache, never into the repo.
- `magnifito-edit` skill documents it.

## Tests

Each phase adds its own suite file under `evaluations/` (not the monolithic `runner.ts`), run by
`npm test`. Suites that need Chrome, Python or model weights skip with a printed reason when the
dependency is missing, and never report a skip as a pass.

## Done when

- `npm run build`, `npm test`, `npm run lint:docs` pass.
- A fixture brief with `engine: "motion"` renders an animated video using all four recipes.
- Vendored file hashes match the lock file.
