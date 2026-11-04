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

For the full pre-delivery QA pass (determinism, frame sheets, text, contrast, dead air, captions, release checklist), follow [`reference/render-qa.md`](reference/render-qa.md).

## Signing Review Record

The output `review-record.json` records:
- `reviewer`: Producer/engineer name.
- `timestamp`: UTC ISO timestamp.
- `approval_scope`: Contains `copy_claims_revision`, `design_styleframe_revision`, and `final_cut_hash`.
- Any subsequent change to copy, styling, or media invalidates the approval scope and requires re-review.

