# Magnifito Security, Policy & Governance

The Magnifito Super Video platform enforces strict enterprise security policies, zero-budget isolation guards, multi-role human governance, and cryptographic artifact verification.

---

## 1. Zero External Media Budget Policy

### The $0.00 Invariant
The platform enforces a strict `$0.00` budget for external media APIs (e.g. paid generative AI APIs, stock footage libraries, paid synthetic voice services):
- Every `ProjectBrief` must set `budgets.media_budget_usd = 0.0`.
- The `PolicyChecker` inspects every outgoing operation. If any paid API call is attempted or a non-zero media cost is detected, the engine throws:
  ```
  Error: [MEDIA_BUDGET_ZERO_VIOLATION] External media budget exceeded: 2.50 USD > 0.00 USD policy limit.
  ```
- **Auditing Command**:
  ```bash
  mgvideo cost <run_id>
  ```
  Verifies that compute and agent operations are accounted for, and external media spend is verified at `$0.00`.

---

## 2. Upstream Quarantine Boundary

The platform tracks 12 external open-source motion graphics and video editing repositories. To maintain total sovereign security:

### Quarantine Rules
1. **Never Execute Untrusted Upstream Code**: The repository discovery scripts and catalog inspector only inspect static git metadata and manifest files; **they never execute external scripts or packages**.
2. **Immutable Commit Pinning**: Every upstream repository in `registry/upstreams.json` is pinned by an exact, immutable 40-character commit SHA:
   ```json
   {
     "id": "hyperframes",
     "name": "HyperFrames",
     "owner": "hyperframes",
     "repo": "hyperframes",
     "observed_commit": "5c5794287bd0dc2c94f238ca89f4752ecaa045a2",
     "license": "Apache-2.0"
   }
   ```
3. **Candidate Proposal & Static Qualification**: When a new commit is detected, `mgvideo upstream propose <source_id>` generates an isolated candidate review branch with automated qualification tests run in a disposable, unprivileged runner.
4. **Automated Rollback**: If a candidate causes regression, `mgvideo upstream rollback <source_id>` instantly updates `registry/approved.lock.json` back to the last known stable baseline.

---

## 3. Strict Specialist Skill Packaging Allowlist

The skill packager (`tools/packaging/packager.ts`) enforces an immutable allowlist containing **only the 10 canonical specialist skills**:

1. `magnifito-video` (Orchestration router)
2. `magnifito-storyboard` (Visual styleframes & contact sheets)
3. `magnifito-speech` (Pacing, transcript alignment, lexicon)
4. `magnifito-typography` (Bulgarian Cyrillic fitting & line wraps)
5. `magnifito-saas-demo` (UI tours & animated cursor paths)
6. `magnifito-talking-head` (Dual-timeline EDL & lower thirds)
7. `magnifito-commerce` (Dynamic catalog batches & SKU gating)
8. `magnifito-audio` (EBU R128 loudness & sidechain ducking)
9. `magnifito-quality` (Safe zones, SSIM/PSNR, compliance)
10. `magnifito-upstream` (Quarantine catalog & rollback)

Any vendor discovery trees, tests, or external mock modules outside this strict allowlist are rejected during build packaging.

---

## 4. Three-Role Human Review Governance

Before a video deliverable can be packaged for broadcast or client handoff, a signed `review-record.json` must be approved across three organizational roles:

| Role | Responsibility | Checklist Criteria |
|---|---|---|
| **Creative Review** | Creative Director / Art Director | Motion fluidity, visual style, brand color fidelity, narrative pacing |
| **Legal Review** | Legal Counsel / Compliance Officer | Factual claims verified against `claims.json`, trademark usage, CC0 music clearance |
| **Technical Review** | Video Engineer / QA Lead | Rec.709 color tags, EBU R128 loudness (-16 LUFS), mobile safe zones, duration exactness |

```bash
# Package deliverable with signed review record
mgvideo package <run_id> ./projects/promo-bg --reviewer "Kiril Kirov"
```

---

## 5. Cryptographic Checksum & Merkle Tree Verification

Every deliverable package generates two layers of cryptographic integrity verification:

### 1. GNU Standard Checksum Manifest (`SHA256SUMS.txt`)
Contains the SHA-256 hash of every deliverable file (video master, captions, metadata, legal notices, brand profile):
```text
3e144458f4a7c06eb154bb3f7a6374f4b4cefe4369a13b63fa06bb18579d4692  brand.json
19b671a47dfd48f7d983422a5fb685bc95711c2cfaf50ca53bb5e468ff89c629  brief.json
0c43698dca5f91ebce707d7301c238b7a66fbc4b2da019a2791e2b5e283286bf  promo_final.mp4
```

### 2. Hierarchical Binary Merkle Tree (`MerkleManifest`)
Computes leaf hashes and iteratively pairs them to generate a single cryptographic **Merkle Root Hash** (`64-character hex`), enabling instant non-repudiation and enterprise handoff validation.

```bash
# Verify deliverable package integrity
mgvideo verify-bundle deliverable.tar.gz

# Compute Merkle Root for directory
mgvideo merkle ./deliverables
```

