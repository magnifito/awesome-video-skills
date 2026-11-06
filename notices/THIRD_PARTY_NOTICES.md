# Third-Party Notices & Provenance Register

This toolkit references and adapts patterns from audited upstream open-source repositories.
As established in the Magnifito Super Video Blueprint (2 November 2026), all upstream imports are kept strictly isolated and categorized.

## Audited Source Repositories

### 1. Barty Bart Motion Graphics
- **Repository**: `Barty-Bart/motion-graphics`
- **Audited Commit**: `3d83d987d658601d8a1269eb691622bdcd427335`
- **License**: MIT
- **Component Notices**: Geist Font (OFL-1.1), Lucide Icons (ISC), Bundled audio (CC0-1.0), Mixkit runtime audio (Restricted-NonRedistributable).

### 2. Charlie Motion Graphics Skills
- **Repository**: `charlie947/motion-graphics-skills`
- **Audited Commit**: `229022ebca76972e119e36ada23a1648d51665ab`
- **License**: MIT

### 3. HyperFrames
- **Repository**: `heygen-com/hyperframes`
- **Audited Commit**: `5c5794287bd0dc2c94f238ca89f4752ecaa045a2`
- **License**: Apache-2.0
- **Copyright**: (c) 2024-2026 HeyGen Inc.
- **Component Notices**: Audio files require individual attribution check.

### 4. Video Shotcraft
- **Repository**: `Vincentwei1021/video-shotcraft`
- **Audited Commit**: `1266a3ec4831289c4d893d42dd5102723658039a`
- **License**: MIT
- **Copyright**: (c) 2025-2026 Vincent Wei

### 5. Herk Edit Kit
- **Repository**: `nateherkai/herk-edit-kit`
- **Audited Commit**: `10511e5af86fc47756ea89803b397422e2d89284`
- **License**: MIT
- **Copyright**: (c) 2025-2026 Nate Herkai

### 6. Noam SaaS Product Demo
- **Repository**: `noamdorr/saas-product-demo-video`
- **Audited Commit**: `74f4f7150810b1bb5bf9160c4a2742c5dce69b62`
- **License**: MIT
- **Copyright**: (c) 2025-2026 Noam Dorr

### 7. Official Remotion Skills
- **Repository**: `remotion-dev/skills`
- **Audited Commit**: `a2824c67f8b4585c294a8101db9f9f0ad3c643f8`
- **License**: Remotion Company License / Remotion Commercial Terms
- **Notice**: Remotion engine terms require explicit licensing evaluation based on whether client receives rendered MP4 vs source project.

### 8. Iart B-Roll Skills
- **Repository**: `iart-ai/b-roll-skills`
- **Audited Commit**: `a51e34b0a8def533759373733bde1869c21075fb`
- **License**: MIT

### 9. Iart Ecommerce Video Skills
- **Repository**: `iart-ai/ecommerce-video-skills`
- **Audited Commit**: `2bd0dd19c9b2df5230f5d8f7453861b9681e49b4`
- **License**: MIT

### 10. Noam HTML Product Video
- **Repository**: `noamdorr/claude-motion-saas-video`
- **Audited Commit**: `dfbe716495abfad263b2b8c783c21b3940b8e225`
- **License**: MIT

### 11. Revideo
- **Repository**: `midrender/revideo`
- **Audited Commit**: `b5de67a009a55aa2768a1e178b0446b2479a0b4e`
- **License**: MIT

### 12. Motion Canvas
- **Repository**: `motion-canvas/motion-canvas`
- **Audited Commit**: `7b91435c301d530351dcf5ebb91dd139c002e405`
- **License**: Core MIT; `@motion-canvas/ffmpeg` exporter is GPL-3.0.


## Generated media (model outputs, no model files committed)

### Mira's voice in the showcase
- **Model**: `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` (Hugging Face)
- **Pinned Revision**: `5ecdb67327fd37bb2e042aab12ff7391903235d3`
- **License**: Apache-2.0
- **Use**: `tools/voice/generate_mira.py` designs a new voice from a text description (no cloning, not
  based on a real person) and writes `showcase/<project>/voice/mira.wav` and `mira.json`. Only these
  outputs are committed; the weights and the Python environment stay outside the repository.

### Mira's lip-sync timing
- **Data**: CMUdict, the Carnegie Mellon Pronouncing Dictionary (`cmusphinx/cmudict`)
- **Pinned Commit**: `74790861f652b15e4ac49015a90074ad62a27690` (`cmudict.dict`, SHA-256 checked)
- **License**: BSD-2-Clause, Copyright (C) 1993-2015 Carnegie Mellon University
- **Use**: `tools/voice/visemes.py` downloads the dictionary into the cache outside the repository,
  looks up each spoken word's phonemes and times them against the committed `mira.wav`. Only the
  derived timing (the `visemes` block of `showcase/<project>/voice/mira.json`: phoneme symbols with
  start and end times and a mouth shape) is committed, not the dictionary. No model is involved.

### Mira as an AI presenter (`showcase/11-ai-presenter`)

`showcase/11-ai-presenter/presenter/mira-ai.mp4` is AI-generated: a photoreal but fictional
woman, generated from a text prompt only (no photo, no reference image, no real person's likeness,
no celebrity name) and lip-synced to Mira's designed Qwen3-TTS voice above. It is labelled as
AI-generated on screen, in the caption and in the credits. `tools/avatar/generate_mira_ai.py`
makes it outside the repository; only the MP4 and its provenance file `mira-ai.json` are
committed. No model weights, code checkout or Python environment are committed.

- **Code**: `GAIR-NLP/daVinci-MagiHuman` (GitHub), commit
  `209209b7086eba2020c5439265221495a8357322`, by SII-GAIR and Sand.ai.
  - **License**: Apache-2.0, stated in the README and in the header of every source file
    ("Copyright (c) 2026 SandAI"). The repository has no LICENSE file.
  - Run with a local port to Apple MPS (`tools/avatar/magihuman-mps.patch`: PyTorch SDPA instead
    of FlashAttention, MagiCompiler optional, no CUDA-only calls, sampler sigmas read as Python
    floats to avoid an MPS mixed-device bug). The patch is a derivative work
    under Apache-2.0 and keeps the original headers.
- **DiT weights (15B, distilled, 256p)**: `SII-GAIR/daVinci-MagiHuman-Distill-256p`
  (Hugging Face), revision `e13bade0a867fb0a01f453797cfbc33dbdd1615f`, folder `transformer/`.
  - **License**: Apache-2.0 (model card).
- **Turbo VAE decoder**: `GAIR/daVinci-MagiHuman`, revision
  `7fe95e50c11bd92bdadf94cd51dbec18427f8e0c`, folder `turbo_vae/`.
  - **License**: Apache-2.0 per the model card. Provenance unclear: a Sand.ai retrain of
    Turbo-VAED (`hustvl/Turbo-VAED`), whose GitHub repository states no license.
- **Video VAE**: `vae/Wan2.2_VAE.pth` in the Distill-256p repository, from Wan2.2-TI2V-5B
  (`Wan-AI/Wan2.2-TI2V-5B`).
  - **License**: Apache-2.0.
- **Text encoder**: `text_encoder/` in the Distill-256p repository, T5Gemma 9B-9B UL2
  (`google/t5gemma-9b-9b-ul2`, model card `license: gemma`).
  - **License**: Gemma Terms of Use (https://ai.google.dev/gemma/terms) and the Gemma Prohibited
    Use Policy. Not Apache-2.0. The weights are not redistributed here; only generated output is.
- **Audio VAE**: `audio_vae/` in the Distill-256p repository. This is the Stable Audio Open 1.0
  autoencoder (`stabilityai/stable-audio-open-1.0`, gated): the official configs name
  `stable-audio-open-1.0`, the loader is the "Stable Audio Feature Extractor", and the
  `model.safetensors` (4,853,889,016 bytes) and `model_config.json` match the original's sizes.
  SII-GAIR re-hosts it under the repository's Apache-2.0 tag, which does not relicense it.
  - **License**: Stability AI Community License Agreement (last updated July 5, 2024),
    https://stability.ai/community-license-agreement. Free commercial use is allowed only for
    individuals and organisations with **less than US$1,000,000 in annual revenue**; above that,
    a Stability AI Enterprise licence is required. The licence is revocable and includes Stability
    AI's Acceptable Use Policy.
  - **Condition of use here**: Magnifito uses it under the Community License on the basis that its
    annual revenue is below US$1M. Re-check before reusing this clip or the generator if that
    changes.
  - **Attribution**: Powered by Stability AI.
