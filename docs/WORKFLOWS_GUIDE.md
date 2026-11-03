# Magnifito Super Video Workflows Guide

This guide details the 5 canonical production workflows supported by the Magnifito Super Video platform, including contract structures, commands, and quality verification standards.

---

## Workflow Overview

| Workflow | Key ID | Primary Ratio | Target Audience | Timing Authority | Fixture Path |
|---|---|---|---|---|---|
| **Branded Promo** | `branded-promo` | `9:16` (Vertical) | Social Video (TikTok/Reels/Shorts) | Speech / Voiceover | `fixtures/promo-bulgarian-15s` |
| **SaaS Product Demo** | `product-demo` | `16:9` (Landscape) | B2B Decision Makers / Desktop | UI Action / Visual Cues | `fixtures/product-demo-saas` |
| **Talking-Head Edit** | `talking-head` | `16:9` or `9:16` | Web Video / Interviews | Speech / Transcript | `fixtures/talking-head-edit` |
| **Multi-SKU Commerce Batch** | `commerce-batch` | `9:16` or `1:1` | E-Commerce Shoppers | Dynamic Visual Pace | `fixtures/commerce-batch` |
| **Multilingual Explainer** | `explainer` | `16:9` (Landscape) | Global Audience (EN / BG) | Localized Speech Pacing | `fixtures/multilingual-explainer` |

---

## 1. Branded Promo (Bulgarian Cyrillic 15s)

### Objectives & Constraints
- Deliver a fast-paced 15-second vertical promo for the Bulgarian market.
- Validate Cyrillic font rendering (`U+0400–U+04FF`) to prevent tofu characters.
- Ensure strict compliance with mobile platform UI margins (TikTok, Instagram Reels, YouTube Shorts).
- Maintain voiceover loudness at EBU R128 (`-16.0 LUFS ±0.5 LUFS`, `-1.0 dBTP`).

### Directory Structure
```
fixtures/promo-bulgarian-15s/
├── brief.json             # Project brief (15s, 9:16, language: "bg", zero media budget)
├── brand.json             # Brand profile (Inter font, brand colors, voice guidelines)
├── claims.json            # 3 verified factual claims with citations
├── assets.json            # Visual/audio assets with sha256 checksums
├── scene-plan.json        # 3 timed scenes with Cyrillic copy
└── runs/                  # Deterministic render output artifacts
```

### Production Lifecycle
```bash
# 1. Validate environment
mgvideo doctor

# 2. Compile scene plan from verified claims
mgvideo plan fixtures/promo-bulgarian-15s

# 3. Interactive live preview scrubber
mgvideo preview fixtures/promo-bulgarian-15s --port 3456

# 4. Generate storyboard styleframe review contact sheet
mgvideo storyboard fixtures/promo-bulgarian-15s --format 9:16

# 5. Execute frozen render
mgvideo render fixtures/promo-bulgarian-15s --format 9:16

# 6. Run automated quality gate audit
mgvideo gate fixtures/promo-bulgarian-15s

# 7. Package client deliverable with review signing
mgvideo package <run_id> fixtures/promo-bulgarian-15s --reviewer "Kiril Kirov"

# 8. Cryptographic bundle verification
mgvideo bundle <delivery_dir>
mgvideo verify-bundle <bundle.tar.gz>
```

---

## 2. SaaS Product Demo (16:9 Desktop Tour)

### Objectives & Constraints
- Feature high-fidelity software UI tours with smooth simulated mouse cursors and highlight glows.
- Guarantee Rec.709 broadcast color space flags on MP4 deliverables.
- Bind all UI feature claims to the verified claims register.

### Key Recipes & Engine
- Uses the `saas-interface-tour` shot recipe with animated cursor movements (`pointer-events: none`).
- Employs `Cool Tech` cinematic grading preset to enhance modern SaaS interfaces.

### Production Lifecycle
```bash
# 1. Compile scene plan
mgvideo plan fixtures/product-demo-saas

# 2. Render 16:9 master video
mgvideo render fixtures/product-demo-saas --format 16:9

# 3. Apply cool-tech cinematic color grade
mgvideo grade fixtures/product-demo-saas/runs/<run_id>/final_output.mp4 --preset cool-tech

# 4. Generate promotional poster frame
mgvideo thumbnail fixtures/product-demo-saas/runs/<run_id>/final_output.mp4 --time 2.0 --format png

# 5. Extract editing proxy for review
mgvideo proxy fixtures/product-demo-saas/runs/<run_id>/final_output.mp4 --res 540p
```

---

## 3. Talking-Head Edit (Dual-Timeline EDL)

### Objectives & Constraints
- Maintain dual-timeline preservation: source media presentation timestamps (microseconds) are mapped accurately to edited sequence frames.
- Align speech word-level timestamps with lower-third speaker title badges.
- Automatically cut dead air and speech pauses using acoustic silence detection.

### Production Lifecycle
```bash
# 1. Remove vocal dead air from dialogue
mgvideo silence fixtures/talking-head-edit/voice.wav --threshold -38 --min 0.4

# 2. Burn broadcast lower-third speaker title badge
mgvideo lower-third fixtures/talking-head-edit/interview.mp4 \
  --name "д-р Георги Димитров" \
  --title "Главен изследовател по ИИ" \
  --accent "#2563EB"

# 3. Apply vocal-leveler dynamics compression
mgvideo compress-audio fixtures/talking-head-edit/voice.wav --preset vocal-leveler

# 4. Burn-in title disclaimer card
mgvideo title fixtures/talking-head-edit/interview.mp4 \
  --title "Експертно интервю" \
  --subtitle "Записано в студио София" \
  --position top
```

---

## 4. Multi-SKU Dynamic Commerce Batch

### Objectives & Constraints
- Render high-volume commercial product videos from a structured product catalog (`catalog.json`).
- Dynamically skip out-of-stock items (`in_stock: false`) with recorded audit status `skipped_out_of_stock`.
- Support concurrent rendering workers without thread race conditions.

### Catalog Schema (`catalog.json`)
```json
{
  "batch_id": "nov-flash-sale-2026",
  "client_id": "nordic-gear-store",
  "currency": "EUR",
  "items": [
    {
      "sku": "NGS-101",
      "title": "Nordic Thermal Trekking Jacket Pro",
      "price": 149.99,
      "discount_percent": 25,
      "in_stock": true,
      "image_asset": "assets/jacket.png",
      "status": "pending"
    },
    {
      "sku": "NGS-103",
      "title": "Waterproof Alpine Backpack 45L",
      "price": 119.00,
      "discount_percent": 15,
      "in_stock": false,
      "image_asset": null,
      "status": "skipped_out_of_stock"
    }
  ]
}
```

### Production Lifecycle
```bash
# 1. Execute concurrent commerce batch render
mgvideo batch fixtures/commerce-batch/catalog.json --concurrency 4

# 2. Optimize video bitrates for mobile messaging (WhatsApp/Discord)
mgvideo optimize <output.mp4> --size 12.0
```

---

## 5. Multilingual Explainer (EN / BG Synchronized)

### Objectives & Constraints
- Synchronize dual-language narratives (English and Bulgarian) while preserving identical visual motion cards.
- Measure and accommodate language expansion: Bulgarian text is typically 15–25% longer than English.
- Apply `TypographyFitter` to auto-shrink font size and calculate balanced line wraps without visual truncation.
- Mux alternate language dialogue tracks into a single container tagged with ISO 639-2 codes (`eng`, `bul`).

### Production Lifecycle
```bash
# 1. Compile synchronized multilingual scene plan
mgvideo plan fixtures/multilingual-explainer

# 2. Render video master
mgvideo render fixtures/multilingual-explainer --format 16:9

# 3. Mux multitrack audio container
mgvideo multitrack fixtures/multilingual-explainer/runs/<run_id>/final.mp4 \
  --tracks '[{"filePath":"audio/en.wav","language":"eng","title":"English Dialogue","isDefault":true},{"filePath":"audio/bg.wav","language":"bul","title":"Български дублаж"}]'

# 4. Generate YouTube / WebVTT chapter cue markers
mgvideo chapters fixtures/multilingual-explainer
```
