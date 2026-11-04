---
title: Showcase videos and GitHub Pages site
summary: "Nine Magnifito demo projects, one per video type, rendered to committed MP4s, checked by a test suite and shown on a GitHub Pages site"
kind: plan
status: draft
updated: 2026-11-04
---

# Showcase videos and GitHub Pages site

## Goal

One example video per video type the toolkit makes, with Magnifito as the demo client and
English on-screen text. The examples promote the package, act as end-to-end tests, and are
shown on a GitHub Pages site. They are not published on magnifito.com.

## Layout

- `showcase/<prefix>NN-<slug>/`: one self-contained project per example. No prefix = the nine
  main video types; `s` = style gallery (one clip per visual recipe, rendered by that recipe);
  `f` = formats and finishing (one finishing command applied to a committed showcase video).
  - `showcase.json`: the recipe. It holds the prompt given to Claude Code, the exact commands
    that render the video, the output file, and the spec the MP4 must meet. Schema:
    `ShowcaseMetaSchema` in `showcase/lib.ts`.
  - Input config: `brief.json`, `brand.json`, `claims.json`, plans, cues, footage scripts.
  - `README.md`: generated from `showcase.json`. It shows the prompt and the commands.
- `showcase/render.ts`: runs each recipe's commands in order, then writes
  `showcase/videos/<id>.mp4` (H.264 CRF 26, faststart) and `<id>.jpg`. `npm run showcase [-- <id>]`.
- `showcase/videos/`: committed MP4s and posters.
- `site/`: static GitHub Pages site, deployed by `.github/workflows/pages.yml`.
- `evaluations/suites/showcase.ts`: validates every recipe, checks that each README matches
  its recipe, and runs ffprobe on every committed MP4 against `expect`. A full re-render runs
  only with `MGVIDEO_TEST_SHOWCASE=1`.

## Reproducibility rule

`render.ts` executes exactly the commands in `showcase.json`, so the recipe cannot drift from
the committed video. Commands are plain argv: no pipes, redirects, variables or globs. Allowed
programs are `mgvideo`, `ffmpeg` and `node`.

## The nine examples

| Id | Type | Engine | Footage |
| --- | --- | --- | --- |
| 01-branded-promo | Branded promo | hyperframes | none |
| 02-product-demo | Product demo | hyperframes | none |
| 03-talking-head-edit | Talking-head edit | edit | synthetic |
| 04-commerce-variants | Commerce variants | batch | none |
| 05-multilingual-explainer | Multilingual explainer (EN + BG) | hyperframes | none |
| 06-motion-graphics | Motion graphics | motion | none |
| 07-broll | B-roll over a speaker | motion + broll | synthetic |
| 08-sound-pass | Sound pass on 06 | sfx | none |
| 09-object-cutout | Object cut-out | separate | synthetic |

## Style gallery and finishing variants

- `s01`–`s12`: one clip per visual recipe not used by the main examples. Each layout lives in
  `adapters/hyperframes/style-recipes.ts` (`s01`–`s06`) or `adapters/hyperframes/recipes.ts`
  (`s07`–`s12`). The hyperframes engine draws one held frame per scene, so these clips show the
  recipe's layout in its final pose; the recipe `motion` values are not animated yet.
- `f01`–`f06`: `reframe` (9:16 and 1:1), `blur-bg`, `grade`, `lower-third` and `loop`.

## Constraints

- No camera footage: every clip that needs footage uses synthetic footage, made by the recipe
  commands and disclosed with `synthetic_footage: true`.
- Audio is CC0 or generated. Mixkit audio is never used.
- Each MP4 stays under 3 MB where possible; the suite fails above 6 MiB.
