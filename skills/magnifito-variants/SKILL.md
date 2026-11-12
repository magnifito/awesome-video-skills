---
name: magnifito-variants
description: "Generate multi-aspect ratios, Cyrillic/Bulgarian localized variations, and multi-SKU commerce batches."
metadata:
  tested-against: "0.1.0"
---

# Magnifito Localization, Ratios & Commerce Batches

The `magnifito-variants` skill adapts proven video compositions across aspect ratios, languages, and multi-product catalogs.

## 1. Aspect Ratio Adaptation (Layout over Center Crop)

Never blindly crop a 16:9 composition to 9:16:
- **9:16 (Vertical Mobile)**:
  - Stack headline above product card.
  - Safe margins: keep text and key action out of the platform UI zones in
    [`../magnifito-deliver/reference/floor.md`](../magnifito-deliver/reference/floor.md)
    (9:16 generic: 220 px top, 420 px bottom, 140 px right at 1080 wide); `mgvideo validate` checks them.
- **16:9 (Landscape Desktop/TV)**:
  - Side-by-side arrangement: product on left/right, kinetic copy on the opposing side.
- **1:1 (Square Feed)**:
  - Centered hero arrangement with condensed headline leading.

Lower thirds per ratio (`mgvideo lower-third` placement, sizes, timing, alpha checks): `reference/lower-thirds.md`. Another size, length or platform, including cutdowns: `reference/moves.md` (adapt).

## 2. Bulgarian & Multilingual Localization

- Preserve factual equivalence: prices, currencies (`лв.`, `EUR`), and dates must align with approved data.
- Fixed campaign reference time: countdown animations must render from a fixed frozen timestamp in `brief.json`, never the local machine's current clock.

## 3. Commerce SKU Batch Processing

- Input: CSV or JSON catalog of items (`sku`, `title`, `price`, `discount`, `image_url`).
- Validation gate: verify each record before starting render. If image is missing, flag SKU and continue batch.
- Per-item retry tracking: store individual render results by SKU hash so only failed items need retrying.

## Stopping Conditions

- Stop batch if more than 20% of SKU records contain missing or corrupt assets.

