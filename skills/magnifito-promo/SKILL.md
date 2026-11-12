---
name: magnifito-promo
description: "Produce short launch films, kinetic typography, promotional offers, and brand explainers using HyperFrames or the spring-driven motion engine."
metadata:
  tested-against: "0.1.0"
---

# Magnifito Promotional & Explainer Videos

The `magnifito-promo` skill specializes in high-impact, short-form promotional videos (15-60 seconds) rendered through HyperFrames, or through the motion engine (`engine: "motion"`) for spring-driven, motion-blurred product motion graphics.

## Creative Capabilities

- **Kinetic Typography**: Expressive, legible text reveals timed to speech or beats. Text remains sharp at all resolutions.
- **Product Reveal**: Hero shot compositions showcasing client products with branded backdrops and lighting cues.
- **Retail & Offer Cards**: Structured price, discount, and timeline callouts tied to verified claims.

## Motion Engine (`engine: "motion"`)

Set `engine: "motion"` in `brief.json` and `renderer: "motion"` in `scene-plan.json` when the film should feel like a designed product animation: one brand-coloured shape that morphs between states, springs instead of easing curves, and real motion blur (4 sub-frames per frame). It needs system Chrome and `playwright-core`; `mgvideo doctor` reports both.

Every scene must use one of the four motion recipes; `mgvideo render` refuses other recipes with this engine.

| Recipe | Use it for | `copy_text` |
|---|---|---|
| `motion-kinetic-type` | Hook line, key message | One phrase (up to 24 words); a liquid highlight runs word by word. |
| `motion-card-morph` | Feature list, call to action | `Headline \| row 1 \| row 2 \| …` (up to 4 rows); pill, card, then a clicked control. |
| `motion-bars-chart` | Metrics and comparisons | `Title \| Label: 180 min \| …`; link every number via `claims_refs` (approved wording wins). |
| `motion-logo-reveal` | End card | Tagline; put the logo asset (SVG, PNG or JPEG) in `asset_refs`. |

Brand colours, the heading/body fonts (`fonts[].file_path` is embedded; Geist otherwise) and the brand name drive every recipe. Geist covers Latin and Cyrillic, including Bulgarian. Transparent output (`mov_prores`) renders ProRes 4444 with alpha. Engine details: `reference/motion-engine.md`. A working example lives in `fixtures/motion-demo/`.

Kinetic type and beat-locked reels (beat grid, words on screen, sound rules, HyperFrames pitfalls): `reference/kinetic-and-beat-reels.md`.

Pitch mode (hook within 2 s, one belief, one proof, end card at least 2 s, works muted) and its failure table: `reference/pitch-mode.md`. Review notes such as "too busy" or "more punch": `reference/moves.md` (quieter, bolder, delight).

## Production Workflow

1. **Intake Review**:
   - Ensure `brief.json` declares `workflow: "branded-promo"`.
   - Verify `formats` includes desired aspect ratios (e.g. `9:16` for mobile vertical, `16:9` for web/desktop).
2. **Draft Render**:
   - Render Scene 1 (the hook) as a still frame using `mgvideo render <project> --format 9:16` to verify font rendering, contrast, and layout.
3. **Full Render**:
   - Execute complete render request via `mgvideo render <project>`.
   - HyperFrames renders each scene's recipe card frame by frame: elements fade and rise in on the brand `tempo`, cinematic and product recipes drift the camera (off when `camera_style` is `static`), and each card fades out before the cut. It writes `composition.html` as a contract artifact and muxes AAC audio.
   - The motion engine writes one HTML page per scene to `runs/<run_id>/clips/`, captures each with motion blur, and joins them with a silent audio bed for later mixing.
4. **Validation**:
   - Run `mgvideo validate <run_id>` to confirm duration, dimensions, framerate, and claims compliance.

## Stopping Conditions

- Do not proceed with full render if styleframe still shows overlapping text, clipping on mobile vertical safe zones, or missing Cyrillic characters.

