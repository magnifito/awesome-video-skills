---
name: magnifito-variants
description: "Generate multi-aspect ratios, Cyrillic/Bulgarian localized variations, and multi-SKU commerce batches."
---

# Magnifito Localization, Ratios & Commerce Batches

The `magnifito-variants` skill adapts proven video compositions across aspect ratios, languages, and multi-product catalogs.

## 1. Aspect Ratio Adaptation (Layout over Center Crop)

Never blindly crop a 16:9 composition to 9:16:
- **9:16 (Vertical Mobile)**:
  - Stack headline above product card.
  - Safe margins: keep interactive elements within top 15% and bottom 20% clear zones (prevent UI overlap from TikTok/Reels/Shorts).
- **16:9 (Landscape Desktop/TV)**:
  - Side-by-side arrangement: product on left/right, kinetic copy on the opposing side.
- **1:1 (Square Feed)**:
  - Centered hero arrangement with condensed headline leading.

## 2. Bulgarian & Multilingual Localization

- Preserve factual equivalence: prices, currencies (`лв.`, `EUR`), and dates must align with approved data.
- Fixed campaign reference time: countdown animations must render from a fixed frozen timestamp in `brief.json`, never the local machine's current clock.

## 3. Commerce SKU Batch Processing

- Input: CSV or JSON catalog of items (`sku`, `title`, `price`, `discount`, `image_url`).
- Validation gate: verify each record before starting render. If image is missing, flag SKU and continue batch.
- Per-item retry tracking: store individual render results by SKU hash so only failed items need retrying.

## Stopping Conditions

- Stop batch if more than 20% of SKU records contain missing or corrupt assets.

