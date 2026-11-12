---
name: magnifito-brand
description: "Intake and validate brand identity, motion tokens, color contrast, and font licenses for Magnifito video projects."
---

# Magnifito Brand & Motion Intake

The `magnifito-brand` skill establishes and verifies client brand profiles, ensuring typography, palette, motion tokens, and prohibited treatments are strictly enforced before animation begins.

## Contract Specification: `brand.json`

Every project workspace must maintain a validated `brand.json` conforming to `BrandProfileSchema`:

- **Identity**: `brand_id`, `name`, `logos` (primary, monochrome, icon).
- **Colors**: `primary`, `secondary`, `background`, `text_primary`, `accent`. All hex codes must satisfy WCAG AA contrast against their assigned backgrounds.
- **Fonts**: Array of font families, weights, rights evidence (e.g., OFL, Client-Licensed), and `supports_cyrillic: boolean`.
- **Type Scale**: `h1`, `h2`, `body`, `caption`.
- **Motion Preferences**:
  - `tempo`: `'energetic'` | `'calm'` | `'punchy'` | `'smooth'`
  - `camera_style`: `'static'` | `'subtle_drift'` | `'dynamic_whip'` | `'isometric'`
  - `border_radius`: Integer pixels (e.g., 8, 12, 24).
  - `glassmorphism`: Boolean for card blur/translucency.
- **Prohibited Treatments**: Explicit array of forbidden styles (e.g. `["unverified discount banners", "neon chromatic aberration"]`).

## Checking a brand profile

Run `mgvideo brand check <project-dir|brand.json>` before the first render and after every edit to
`brand.json`. Paths inside the file resolve against its folder. It reports:

- **Schema**: `brand.json` parses with `BrandProfileSchema`.
- **Contrast** (WCAG): `text_primary` on `background` and on `secondary` (the brand-title card
  gradient; `background` when no secondary) at 4.5:1, `primary` on `background` at 3:1. `accent` on
  `background` below 3:1 is a warning only: keep that accent off text and information.
- **Fonts**: rights evidence; the `file_path` exists with an `OFL*`/`LICENSE*` file next to it; for
  TTF/OTF, the licence record and Cyrillic glyphs read by `FontAuditor`; for WOFF/WOFF2, family name
  and Bulgarian coverage from `fc-scan`. A font without `file_path` is a warning (system font).
- **Logos**: every declared logo file exists.

It exits 1 when any error-level check fails; warnings do not fail it. `--json` prints the report as
JSON and `--out <file>` also writes what it prints to a file (keep it as review evidence).

Notes about type on screen, or a brand kit read from finished work: `reference/moves.md` (typeset, extract).

## Cyrillic & Bulgarian Typography Rules

When `brief.language` is Bulgarian (`bg`), verify:
1. At least one font in `brand.fonts` declares `supports_cyrillic: true`.
2. The chosen family contains localized Bulgarian glyph forms where applicable.
3. Bulgarian headlines are tested at full render scale to prevent awkward word wrapping.

## Stopping Conditions

- Reject brand profiles referencing local files that lack content hashes or rights evidence.
- Stop if text color and background color fail minimum 4.5:1 contrast for body copy.

