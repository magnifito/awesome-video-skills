---
name: magnifito-product-demo
description: "Demonstrate real software features and UI workflows with accurate cursor movement, interface highlights, and feature claims."
---

# Magnifito Software & Product Demonstrations

The `magnifito-product-demo` skill produces product demonstrations and feature tours for SaaS, desktop, and mobile software.

## Demonstration Principles

1. **Truthful Interface State**:
   - Every demonstrated UI flow must reflect actual software capability.
   - Never fabricate interface controls or imaginary workflows that do not exist in the product.
2. **Smooth Cursor Choreography**:
   - Cursor paths use cubic bezier easing (`cubic-bezier(0.25, 1, 0.5, 1)`) simulating natural user interaction.
   - Click events trigger visual ripple or subtle button compression before subsequent UI changes occur.
3. **Legibility & Pacing**:
   - Zoom in on active interaction areas (120-150% crop) when displaying dense dashboards or mobile screens.
   - Hold on the final result for at least 1.5 seconds so the viewer can absorb the feature's payoff.

Explain mode (one project through one loop, 25 to 45 words per scene) and its failure table: `reference/explain-mode.md`. Notes about wording or narration: `reference/moves.md` (clarify).

## Assets & Synthetic Data

- Store raw high-resolution screen captures (2x Retina or 4K preferred) in the project workspace.
- Any placeholder data shown on screen (names, emails, account numbers) must be synthetic and clearly marked in `assets.json`.

## Stopping Conditions

- Stop if requested feature claims are not corroborated by verified screenshot assets in `assets.json`.

