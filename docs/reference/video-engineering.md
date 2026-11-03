---
title: Magnifito Video Engineering Standards
kind: reference
status: reference
updated: 2026-11-03
---
# Magnifito Video Engineering Standards

This document establishes the video post-production standards, colorimetry specifications, aspect ratio adaptations, and visual quality metrics enforced across the Magnifito Super Video platform.

---

## 1. Broadcast Colorimetry & Metadata Tagging

All MP4 video deliverables must carry standard **ITU-R BT.709** (Rec.709) color space tags to ensure color fidelity across mobile devices, computer displays, and television screens:

```bash
-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv
```

- **Color Primaries**: `bt709` (Standard HD reference primaries).
- **Transfer Characteristics**: `bt709` (Rec.709 gamma curve).
- **Matrix Coefficients**: `bt709` (Luma/Chroma conversion matrix).
- **Color Range**: `tv` (Limited broadcast video levels `16–235` luma, preventing crushed blacks or blown highlights).

---

## 2. Supported Container & Codec Profiles

| Deliverable Profile | Container | Video Codec | Pixel Format | Alpha Support | Typical Purpose |
|---|---|---|---|---|---|
| **Web / Social MP4** | `.mp4` | `libx264` (High Profile) | `yuv420p` | No | Universal playback (TikTok, Reels, YouTube) |
| **Broadcast Master ProRes**| `.mov` | `prores_ks` (Profile 4) | `yuva444p10le` | **Yes (10-bit)**| Broadcast TV handoff & NLE overlays |
| **Web Alpha Transparent** | `.webm`| `libvpx-vp9` | `yuva420p` | **Yes** | Transparent web graphics & UI badges |
| **Editing Proxy** | `.mp4` | `libx264` (Fast Profile) | `yuv420p` | No | 540p / 720p lightweight low-latency editing |

### Rendering Transparent Alpha Video
```bash
# Render transparent ProRes 4444 overlay
mgvideo render ./projects/lower-third --codec mov_prores --transparent

# Render transparent WebM VP9
mgvideo render ./projects/lower-third --codec webm --transparent
```

---

## 3. Mobile Platform UI Safe Zones (9:16)

For vertical short-form video (TikTok, Instagram Reels, YouTube Shorts), interactive UI elements (like buttons, comment drawers, account handles, and sound tickers) obscure edges.

```
+------------------ 1080 px ------------------+
|                   TOP MARGIN (140 px)        |  <-- Avoid top notch/status bar
|  +----------------------------------------+  |
|  |                                        |  |
|  |                                        |  |
|  |           SAFE CONTENT AREA            |  |
|  |           (842 x 1396 px)              |  |
|  |                                        |  |
|  |                                        |  |  <-- RIGHT MARGIN (130 px):
|  |                                        |  |      Like, Comment, Share buttons
|  +----------------------------------------+  |
|                BOTTOM MARGIN (384 px)        |  <-- Caption, hashtags, sound ticker
+----------------- 1920 px -------------------+
```

- Safe Width: `842 px` (centered horizontally).
- Safe Top Offset: `140 px`.
- Safe Bottom Margin: `384 px`.
- The `LayoutAuditor` automatically inspects layer positions and flags any copy or UI cards overlapping these margins.
- Visual overlay: `mgvideo safezone <video>` burns the bounding guide onto video for review.

---

## 4. Multi-Format Aspect Ratio Reframing

| Target Ratio | Resolution | Crop Strategy | Usage |
|---|---|---|---|
| **9:16** | `1080 x 1920` | `SmartCrop` (focal: `top`) | TikTok, Instagram Reels, YouTube Shorts |
| **16:9** | `1920 x 1080` | Fit with Letterbox / Blur BG | YouTube, LinkedIn, TV Playout, Desktop |
| **1:1** | `1080 x 1080` | Center Crop / Equal Pad | Instagram Feed, E-Commerce Catalogs |
| **4:5** | `1080 x 1350` | Center Crop | Facebook / Instagram Mobile Feed |
| **2.39:1** | `1920 x 803` (matted) | Letterbox Black Bars | Cinematic Widescreen Theatrical Scope |

```bash
# Smart crop with focal headroom bias for talking heads
mgvideo smart-crop master.mp4 --ratio 9:16 --focus top

# Adapt 9:16 vertical video onto 16:9 canvas with blurred backdrop
mgvideo blur-bg master.mp4

# Apply 2.39:1 theatrical scope letterbox
mgvideo matte master.mp4 --preset 2.39:1
```

---

## 5. Visual Regression Metrics (SSIM & PSNR)

To detect visual degradation or unintended rendering drift, `MediaInspector` executes frame-by-frame mathematical comparison:

- **SSIM (Structural Similarity Index)**:
  - Range: `0.0` to `1.0`.
  - Production Acceptance Threshold: `>= 0.98` between identical versions.
  - Measures luminance, contrast, and structure degradation.
- **PSNR (Peak Signal-to-Noise Ratio)**:
  - Acceptance Threshold: `>= 42.0 dB`.
  - Measures mean-squared error in pixel values.

```bash
mgvideo diff runA/final_output.mp4 runB/final_output.mp4
```
Outputs visual drift report and generates difference heatmap frames if divergence is detected.

