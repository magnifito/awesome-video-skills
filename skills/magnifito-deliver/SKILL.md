---
name: magnifito-deliver
description: "Verify version-bound approvals, asset rights, ffprobe specifications, and assemble client delivery package."
---

# Magnifito Validation, Packaging & Approval Record

The `magnifito-deliver` skill is the final production gate. It audits rendered video outputs against technical specifications, confirms rights clearance, and compiles the signed delivery bundle.

## Deliverable Package Structure

Executing `mgvideo package <run-id>` creates `delivery/<run-id>/`:

```text
delivery/<run-id>/
├── [project_id]_[lang]_final.mp4     # Master delivery video
├── brief.json                        # Frozen client brief
├── brand.json                        # Approved brand tokens
├── claims.json                       # Factual claims register
├── NOTICES.txt                       # Licenses and asset attribution
├── review-record.json                # Cryptographically signed approval record
└── delivery-manifest.json            # Package SHA-256 manifest
```

## Verification Checks

Before packaging, `mgvideo validate <run-id>` executes:
1. **File Integrity**: Checks SHA-256 against `render-result.json`.
2. **ffprobe Specs**: Verifies requested dimensions (`width`, `height`), framerate (`fps`), and audio stream presence.
3. **Claims Preservation**: Asserts that copy in rendered scenes matches `claims.json` verbatim.
4. **Rights Clearance**: Verifies no assets carry `status: "unresolved"` or `status: "expired"`.

Every failed check is an issue with a rule id, a severity and a fix, listed most severe first:
P0 breaks the delivery (wrong file, changed inputs, claims wording), P1 must be fixed before
delivery, P2 should be fixed, P3 is a note. `validate` exits 0 when no P0 or P1 failed, 1 when one
did, and 2 when it could not run (no run, missing manifest). `--json` gives
`{ issues: [{ rule, severity, at_s?, says, fix }], counts, items, ... }`. `mgvideo package`
refuses a run with any P0 or P1 issue.

`validate` also measures the final file: loudness and true peak against the render request's
targets, a silent track, a bed that cuts out with no fade, still picture (3 s, blocking from 6 s),
black spans and flashing (WCAG 2.3.1). For the HyperFrames and html engines it also checks every
text element the renderer drew: clipped, inside the platform UI zones, too small, too low contrast
against the pixels behind it, too short to read, or overlapping. The numbers are in
[`reference/floor.md`](reference/floor.md). A deliberate exception goes in `<project>/validate.json`
with a reason, which the report prints; see [`reference/render-qa.md`](reference/render-qa.md).

The text rules also run before any render: `mgvideo check <project> --quick` measures the text
straight from the scene plan (no video encode, a few seconds) and prints nothing when it is clean.
The plugin runs it after every edit of a project file (`hooks/hooks.json`): P0 and P1 come back as
a block to fix, P2 and P3 as notes. Run it after changing copy, recipes or brand fonts, and still
run `validate` on the render.

The run id is optional: `mgvideo validate latest -p <project>` (or no run id) picks the newest
`runs/run-*` of the project. `--out <file>` saves the printed report next to the delivery, and
`--json --out <file>` saves the JSON report. `mgvideo chapters <project> --out chapters.txt`
saves the YouTube chapters (`--format vtt|ffmetadata` for WebVTT or FFmetadata).

For the full pre-delivery QA pass (determinism, frame sheets, text, contrast, dead air, captions, release checklist), follow [`reference/render-qa.md`](reference/render-qa.md).

## Cutdowns and file names

- A cutdown (6 s, 15 s, 30 s) is its own edit with its own hook and ending, planned and validated
  like any render, never the long cut stopped early.
- Files handed over per platform are named in lowercase letters, digits and hyphens, with shape and
  length: `spring-launch-9x16-15s.mp4`. (The bundle master from `mgvideo package` keeps its
  `[project_id]_[lang]_final` name.)
- A new version renders beside the old file (`spring-launch-9x16-15s-v2.mp4`), never over it. No
  `final-v2-FINAL.mp4`.

Before calling it done, critique the render, then polish: [`reference/moves.md`](reference/moves.md).

## Signing Review Record

The output `review-record.json` records:
- `reviewer`: Producer/engineer name.
- `timestamp`: UTC ISO timestamp.
- `approval_scope`: Contains `copy_claims_revision`, `design_styleframe_revision`, and `final_cut_hash`.
- Any subsequent change to copy, styling, or media invalidates the approval scope and requires re-review.

