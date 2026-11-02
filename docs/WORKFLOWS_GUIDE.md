# Magnifito Super Video Workflows Guide

This guide details the 5 canonical workflows supported by the Magnifito Super Video platform.

---

## 1. Branded Promo (Bulgarian Cyrillic 15s)
- **Path**: `fixtures/promo-bulgarian-15s`
- **Aspect Ratio**: `9:16` (Vertical TikTok/Reels/Shorts)
- **Key Features**:
  - Full Cyrillic text rendering and pronunciation guide (`BrandLexicon`).
  - Mobile safe-zone compliance (elements stay within 842px width, avoiding bottom 384px and right 130px UI).
  - Sidechain ducked background music (-16 LUFS target).
  - Dual captions export (`.srt` and `.vtt`).

---

## 2. SaaS Product Demo (16:9 Tour)
- **Path**: `fixtures/product-demo-saas`
- **Aspect Ratio**: `16:9` (1920x1080 Landscape)
- **Key Features**:
  - `saas-interface-tour` shot recipe with simulated cursor movement and border glow highlights.
  - Claims linking to software feature documentation.
  - Multi-scene timeline transitions.

---

## 3. Talking-Head Edit (Dual-Timeline EDL)
- **Path**: `fixtures/talking-head-edit`
- **Aspect Ratio**: `16:9` or `9:16`
- **Key Features**:
  - Dual-timeline preservation: Maps source media presentation timestamps (microseconds) to edited sequence frames.
  - Transcript alignment with word-level timestamps.
  - Speech-timed lower-third overlays (`interview-speaker-card`).
  - Silence removal and dynamic pacing.

---

## 4. Multi-SKU Commerce Batch
- **Path**: `fixtures/commerce-batch`
- **Aspect Ratio**: `9:16` or `1:1`
- **Key Features**:
  - High-throughput catalog rendering across multiple SKUs.
  - Automatic inventory gating: Skips `in_stock: false` products with `skipped_out_of_stock` status.
  - Per-SKU pricing, discount tags, and claim binding.
  - Concurrent multi-worker execution with retry state tracking.

---

## 5. Multilingual Explainer (EN/BG Synchronized)
- **Path**: `fixtures/multilingual-explainer`
- **Aspect Ratio**: `16:9`
- **Key Features**:
  - Multi-locale claim synchrony (`statement` vs `statement_bg`).
  - Speech pacing analysis (`LocalizationSynchronizer`) measuring expansion ratios.
  - Dynamic font sizing and line wrapping (`TypographyFitter`) to fit localized text inside card bounds without line clipping.
