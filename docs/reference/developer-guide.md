---
title: Magnifito Developer Guide
kind: reference
status: reference
updated: 2026-11-03
---
# Magnifito Developer Guide

This guide covers getting started with development on the Magnifito Super Video platform, running evaluations, extending shot recipes, and adding new media engines.

---

## 1. Prerequisites & Environment Setup

### Required System Tools
- **Node.js**: v20.x or v22.x LTS
- **FFmpeg**: v6.0 or higher with `libx264`, `libvpx-vp9`, `aresample`, and `soxr`
- **FFprobe**: Installed alongside FFmpeg
- **Image Conversion**: macOS native `sips` (or Google Chrome / Chromium for headless SVG rasterization)

### Environment Verification
Run the built-in diagnostic tool to verify all host dependencies, directory permissions, and font availability:
```bash
npx tsx packages/cli/src/bin/mgvideo.ts doctor
```

---

## 2. Repository Layout & Build

```bash
# Clone the repository
cd /path/to/awesome-video-skills

# Install dependencies
npm install

# Compile TypeScript across all packages and adapters
npm run build
```

---

## 3. Running the Comprehensive Evaluation Suite

The platform contains 120 automated evaluation test suites validating all 106 platform iterations, policy invariants, and media engines:

```bash
# Run full evaluation suite
npm run build && npx tsx evaluations/runner.ts
```

All 120 test suites will execute and output:
```
========================================
EVALUATION SUMMARY: 440 Passed, 0 Failed
========================================
```

---

## 4. Creating a New Shot Recipe

Shot recipes provide reusable motion graphics behaviors and design systems (e.g. `cinematic-title`, `saas-interface-tour`).

To register a new recipe:
1. Open `packages/media/src/shot_recipes.ts`.
2. Add a new `ShotRecipe` definition:
   ```typescript
   export const myNewRecipe: ShotRecipe = {
     id: 'product-feature-reveal',
     name: 'Product Feature Reveal',
     description: 'Zooms into product visual with soft back glow and bullet callouts',
     defaultDurationSeconds: 4.0,
     recommendedAspectRatios: ['16:9', '9:16'],
     motionParameters: {
       cameraZoom: 1.15,
       glowColor: '#3B82F6',
       textStaggerSeconds: 0.3
     }
   };
   ```
3. Register the recipe in `listShotRecipes()`.
4. Test with the CLI:
   ```bash
   mgvideo recipe product-feature-reveal
   ```

---

## 5. Adding a New Media Engine

When introducing a new media processing capability:
1. Create a dedicated module in `packages/media/src/<engine_name>.ts`.
2. Ensure the class handles file existence checks and writes output into an isolated directory.
3. Export the module in `packages/media/src/index.ts`.
4. Expose the method on `MagnifitoVideoEngine` in `packages/sdk/src/index.ts`.
5. Register the corresponding CLI command in `packages/cli/src/bin/mgvideo.ts`.
6. Add options documentation to `docs/reference/cli-reference.md`.
7. Add an end-to-end test suite in `evaluations/runner.ts`.
8. Verify with `npm run build && npx tsx evaluations/runner.ts`.

---

## 6. Live Interactive Debugging

### Live Preview Server
Start an interactive local HTTP server on port 3456 to scrub animations in real-time:
```bash
mgvideo preview fixtures/promo-bulgarian-15s --port 3456
```

### Visual Storyboard Contact Sheet
Generate high-resolution PNG styleframes and an interactive HTML review sheet:
```bash
mgvideo storyboard fixtures/promo-bulgarian-15s --format 9:16
open fixtures/promo-bulgarian-15s/runs/storyboard/storyboard.html
```

### Production Dashboard
Display ASCII system health, binary status, workflow configurations, and zero-spend compliance:
```bash
mgvideo dashboard
```

