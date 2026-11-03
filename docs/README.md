# Magnifito Super Video Platform Documentation

Welcome to the technical documentation for the **Magnifito Super Video** platform — a sovereign, contract-driven, automated video production toolkit developed for high-fidelity social, B2B SaaS, e-commerce, and broadcast deliverables.

---

## Documentation Directory Index

| Document | File Link | Description |
|---|---|---|
| **System Architecture** | [`ARCHITECTURE.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/ARCHITECTURE.md) | High-level system architecture, package topology, rendering adapters, pipeline diagrams, and execution isolation. |
| **CLI Reference** | [`CLI_REFERENCE.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/CLI_REFERENCE.md) | Complete reference guide for all 61 subcommands in the `mgvideo` unified terminal interface. |
| **SDK Reference** | [`SDK_REFERENCE.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/SDK_REFERENCE.md) | Programmatic TypeScript API guide for the `MagnifitoVideoEngine` facade class. |
| **Contracts Specification** | [`CONTRACTS_SPECIFICATION.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/CONTRACTS_SPECIFICATION.md) | Detailed schema specifications for all 11 Zod data contracts, deterministic request hashing, and contract migration. |
| **Workflows Guide** | [`WORKFLOWS_GUIDE.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/WORKFLOWS_GUIDE.md) | Operational walkthroughs for the 5 canonical workflows (Promo, SaaS Demo, Talking-Head, Commerce Batch, Explainer). |
| **Audio Engineering** | [`AUDIO_ENGINEERING.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/AUDIO_ENGINEERING.md) | Broadcast audio standards: EBU R128 loudness (-16 LUFS), sidechain ducking, multitrack audio, noise gate, EQ, and synthesis. |
| **Video Engineering** | [`VIDEO_ENGINEERING.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/VIDEO_ENGINEERING.md) | Video specifications: Rec.709 color spaces, ProRes 4444 alpha transparency, smart crop, PiP, chroma keying, and SSIM/PSNR diffing. |
| **Security & Governance** | [`SECURITY_AND_GOVERNANCE.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/SECURITY_AND_GOVERNANCE.md) | Zero-budget external media spend enforcement, 12-upstream quarantine boundaries, 3-role human review, and Merkle tree verification. |
| **Developer Guide** | [`DEVELOPER_GUIDE.md`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/DEVELOPER_GUIDE.md) | Developer onboarding, local environment diagnostics, build & test execution, adding shot recipes, and debugging tools. |
| **Original Blueprint** | [`magnifito-super-video-blueprint.txt`](file:///Users/kirov/dev/magnifito/awesome-video-skills/docs/magnifito-super-video-blueprint.txt) | Original specification blueprint for Kiril Kirov and the Magnifito video production team. |

---

## Key Platform Statistics

- **Platform Iterations**: 106 automated enhancement iterations across 16 production commits.
- **Evaluation Test Suites**: 120 automated test suites in `evaluations/runner.ts` (**440 passed assertions, 0 failures**).
- **CLI Commands**: 61 subcommands registered under `mgvideo`.
- **Media Engines**: 35+ specialized native audio & video post-production engines.
- **Canonical Specialist Skills**: 10 packaged under strict allowlist boundary.
- **Upstream Quarantine**: 12 external open-source repositories tracked by immutable 40-character commit SHAs.
- **External Media Budget**: Strictly `$0.00` across all production runs.

