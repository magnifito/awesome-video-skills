---
name: magnifito-broll
description: "Add speech-timed graphics, transparent canvas overlays, lower thirds, and animated callouts to talking-head footage."
---

# Magnifito B-Roll & Speech-Timed Graphics

The `magnifito-broll` skill generates contextual graphic layers, lower thirds, and cutaway cards synchronized to spoken dialogue.

## Graphic Overlay Types

1. **Lower Thirds**:
   - Speaker name, title, brand affiliation.
   - Sits in bottom third with safe-margin padding (80px from bottom on 1080p).
2. **Key Term Highlights**:
   - Pops up as the speaker mentions a specific technical term or metric.
   - Tied to `transcript.json` word timestamps via `edl.json` mapping.
3. **Full-Screen Cutaways**:
   - Illustrated diagrams or screenshot cards that replace the camera feed for 2-4 seconds during complex explanations.

## Face Region Avoidance

- Keep graphics outside the central upper-middle bounding box of talking-head shots where the speaker's face is located.
- Maintain transparent background export (`format: "mov_prores"` with alpha) when overlays are supplied as separate compositing stems.

## Stopping Conditions

- Stop if graphic overlay obscures speaker face or subtitles.

