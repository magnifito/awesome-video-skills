---
name: magnifito-promo
description: "Produce short launch films, kinetic typography, promotional offers, and brand explainers using HyperFrames."
---

# Magnifito Promotional & Explainer Videos

The `magnifito-promo` skill specializes in high-impact, short-form promotional videos (15-60 seconds) rendered through HyperFrames.

## Creative Capabilities

- **Kinetic Typography**: Expressive, legible text reveals timed to speech or beats. Text remains sharp at all resolutions.
- **Product Reveal**: Hero shot compositions showcasing client products with branded backdrops and lighting cues.
- **Retail & Offer Cards**: Structured price, discount, and timeline callouts tied to verified claims.

## Production Workflow

1. **Intake Review**:
   - Ensure `brief.json` declares `workflow: "branded-promo"`.
   - Verify `formats` includes desired aspect ratios (e.g. `9:16` for mobile vertical, `16:9` for web/desktop).
2. **Draft Render**:
   - Render Scene 1 (the hook) as a still frame using `mgvideo render <project> --format 9:16` to verify font rendering, contrast, and layout.
3. **Full Render**:
   - Execute complete render request via `mgvideo render <project>`.
   - HyperFrames compiles HTML composition, captures frames, and muxes AAC audio.
4. **Validation**:
   - Run `mgvideo validate <run_id>` to confirm duration, dimensions, framerate, and claims compliance.

## Stopping Conditions

- Do not proceed with full render if styleframe still shows overlapping text, clipping on mobile vertical safe zones, or missing Cyrillic characters.

