# Magnifito Super Video Repository

> Maintained video production toolkit with schema-driven contracts, pinned renderer adapters, and tracked upstreams.
> Prepared for Kiril Kirov and the Magnifito team.

## Overview

Magnifito Super Video provides an end-to-end production architecture that turns client briefs into checked storyboards, reproducible render projects, and cryptographically verified delivery packages.

External open-source motion graphics and video repositories are tracked by immutable commit hashes in an isolated registry. Production execution is mediated through **10 canonical Magnifito skills** and a deterministic CLI tool (`mgvideo`).

---

## Key Architectural Principles

1. **Schema-Driven Contracts**:
   All project inputs, brands, claims, assets, timelines, render requests, and review records follow strict, versioned schemas (`packages/contracts`). Unsupported schemas fail early.
2. **Canonical Hash Caching**:
   Render cache keys are computed strictly from canonical inputs (`brief`, `brand`, `claims`, `assets`, `scene-plan`, and render settings). Operational timestamps and run identifiers are excluded to guarantee deterministic reproducibility.
3. **Factual Claims Integrity**:
   Every visual claim, price, discount, or feature must link directly to an approved entry in `claims.json`. Modifying factual copy invalidates prior review approvals.
4. **Zero-Budget External Call Protection**:
   `media_budget_usd` defaults to `$0.00`. Paid external media or transcription APIs cannot be dispatched without explicit authorization.
5. **Dual-Timeline Preservation**:
   Original raw footage and edited timeline presentation times are tracked independently (microseconds and half-open frame intervals `[start, end)`), ensuring B-roll and transcript timing stay aligned across cuts.
6. **Strict Skill Allowlist**:
   Agent skill packager exclusively distributes the 10 canonical Magnifito skills, preventing vendor leaks and recursive discovery collisions.

---

## Repository Portfolio & Tracked Upstreams

All 12 audited repositories are tracked by immutable commit hash in `registry/upstreams.json`:

| Repository | Audited Observed Commit | License | Magnifito Production Role |
| :--- | :--- | :--- | :--- |
| **Barty Bart Motion Graphics** | `3d83d987d658601d8a1269eb691622bdcd427335` | MIT | B-roll engine & sound utilities |
| **Charlie Motion Graphics Skills**| `229022ebca76972e119e36ada23a1648d51665ab` | MIT | Creative direction & brand intake recipes |
| **HyperFrames** | `5c5794287bd0dc2c94f238ca89f4752ecaa045a2` | Apache-2.0 | **Primary Default Renderer** |
| **Video Shotcraft** | `1266a3ec4831289c4d893d42dd5102723658039a` | MIT | Shot recipes & visual rhythm |
| **Herk Edit Kit** | `10511e5af86fc47756ea89803b397422e2d89284` | MIT | Footage editing & transcript retiming |
| **Noam SaaS Product Demo** | `74f4f7150810b1bb5bf9160c4a2742c5dce69b62` | MIT | Music-led software demonstrations |
| **Official Remotion Skills** | `30d4553ecd46fbc5212fd0ff006ae43af522158b` | Remotion Co. | Isolated alternative profile (tracked) |
| **Iart B-Roll Skills** | `a51e34b0a8def533759373733bde1869c21075fb` | MIT | Speech-timed canvas overlays |
| **Iart Ecommerce Video Skills** | `2bd0dd19c9b2df5230f5d8f7453861b9681e49b4` | MIT | Retail offers & batch commerce |
| **Noam HTML Product Video** | `dfbe716495abfad263b2b8c783c21b3940b8e225` | MIT | Lightweight HTML video experimental reference |
| **Revideo** | `b5de67a009a55aa2768a1e178b0446b2479a0b4e` | MIT | Headless TypeScript framework (watchlist) |
| **Motion Canvas** | `7b91435c301d530351dcf5ebb91dd139c002e405` | MIT / GPLv3 | Vector animation framework (watchlist) |

---

## The 10 Canonical Magnifito Skills

1. **`magnifito-video`** (Router): Classifies jobs, validates prerequisites, coordinates specialist skills.
2. **`magnifito-brand`**: Ingests brand profile, enforces contrast, verifies Cyrillic typography support.
3. **`magnifito-storyboard`**: Converts brief and approved claims into timed, recipe-driven scene plans.
4. **`magnifito-promo`**: Renders launch films, offers, and kinetic explainers using HyperFrames.
5. **`magnifito-product-demo`**: Demonstrates real software UI flows with smooth cursor choreography.
6. **`magnifito-edit`**: Cuts and retimes video footage while preserving dual-timeline mappings.
7. **`magnifito-broll`**: Generates speech-timed transparent overlays and callouts outside the face zone.
8. **`magnifito-audio`**: Transcribes narration, ducks music, and normalizes audio to `-16.0 LUFS` / `-1.0 dBFS`.
9. **`magnifito-variants`**: Adapts layouts to `9:16`, `16:9`, `1:1`, processes Cyrillic copy, and runs commerce batches.
10. **`magnifito-deliver`**: Audits render outputs with ffprobe, verifies rights, and packages signed deliveries.

---

## CLI Surface (`mgvideo`)

```bash
# 1. Environment & Tools Diagnostics
mgvideo doctor

# 2. Inspect Tracked Sources, Baselines & Capabilities
mgvideo catalog

# 3. Initialize a New Project Workspace
mgvideo init projects/my-promo --workflow branded-promo --language bg --duration 15

# 4. Generate Claims-Linked Scene Plan
mgvideo plan projects/my-promo

# 5. Render Video via Pinned Adapter
mgvideo render projects/my-promo --format 9:16

# 6. Validate Output Files, ffprobe Specs & Claims Verification
mgvideo validate <run-id> --project projects/my-promo

# 7. Package and Sign Delivery Bundle with Three-Role Sign-off & Cost Breakdown
mgvideo package <run-id> --project projects/my-promo --reviewer "Kiril Kirov"

# 8. Audit Production & Agent Costs
mgvideo cost <run-id> --project projects/my-promo

# 9. Multi-SKU Commerce Batch with Automatic Caching & Retry Tracking
mgvideo batch fixtures/commerce-batch/catalog.json

# 10. Check Tracked Upstreams for Changes (Read-only, no untrusted execution)
mgvideo upstream check

# 11. Create Candidate Proposal for Upstream Update
mgvideo upstream propose hyperframes

# 12. Roll Back an Approved Baseline
mgvideo upstream rollback hyperframes <commit-sha>
```

---

## Running Evaluations

Run the automated test suite verifying end-to-end rendering, Bulgarian Cyrillic support, factual copy revision gates, and cache reproducibility:

```bash
npm run build
npx tsx evaluations/runner.ts
```

All fixtures are stored in `fixtures/`:
- `fixtures/promo-bulgarian-15s`: 15s vertical promo with Cyrillic copy.
- `fixtures/product-demo-saas`: SaaS interface tour with feature claims.
- `fixtures/talking-head-edit`: Dual-timeline interview cut with transcript mapping.
- `fixtures/commerce-batch`: Multi-SKU commerce batch with retry states.

