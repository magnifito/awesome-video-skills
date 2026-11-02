---
name: magnifito-edit
description: "Cut and retime existing footage, remove silence, and maintain strict dual-timeline mappings between raw and edited timelines."
---

# Magnifito Footage Editing & Dual-Timeline Cuts

The `magnifito-edit` skill handles cutting, trimming, and pacing of real client recordings, ensuring transcript word times and overlay graphics stay synchronized across edits.

## Dual-Timeline Integrity

Editing alters presentation times. Word timestamps from the original transcript do not align with the edited output unless explicitly mapped:

1. **Source Timeline**: Stored in integer microseconds (`source_start_us`, `source_end_us`).
2. **Output Timeline**: Stored in integer half-open frame intervals `[output_start_frame, output_end_frame)`.
3. **Edit Decision List (`edl.json`)**:
   - Every cut records `cut_id`, source range, output range, speed factor, and reason.
   - B-roll, captions, and graphics target the output timeline via `TimelineMapper`.
   - Never overwrite or mutate the original transcript timestamps.

## Pacing Rules

- **Silence Removal**: Truncate pauses longer than 600ms down to 150-250ms for punchy pacing.
- **Word Boundaries**: Never cut closer than 50ms to the start or end of a spoken phoneme.
- **Meaning Preservation**: Ensure cuts do not invert the speaker's intent or omit critical qualifiers.

## Stopping Conditions

- Fail if an edit interval creates a negative duration or references source microseconds beyond media length.

