"""
Generates the photoreal AI presenter clip of Mira, the fictional presenter in the showcase, with
daVinci-MagiHuman (SII-GAIR & Sand.ai), lip-synced to her committed Qwen3-TTS voice, and writes the
committed source files of showcase/11-ai-presenter (the recipe never needs the model):

    showcase/11-ai-presenter/presenter/mira-ai.mp4    H.264 CRF 23 + AAC, the generated clip with
                                                     Mira's original voice track muxed back in
    showcase/11-ai-presenter/presenter/mira-ai.json   provenance: code commit, weight revisions,
                                                     prompt, seed, settings, timing, licences

Mira is fictional. The clip is made from a text prompt only (MagiHuman text+audio-to-video): no
photo, no reference image, no real person's likeness, no celebrity name. Her voice is the designed
Qwen3-TTS voice from tools/voice/ (read-only here): the 07-broll take, lines 1 and 2.

The official code assumes CUDA (FlashAttention, MagiCompiler, NCCL). magihuman-mps.patch, next to
this file, ports it to Apple MPS / CPU with the smallest change set: PyTorch SDPA attention instead
of FlashAttention, MagiCompiler optional (eager mode), a one-process gloo group, a device helper in
place of hard-coded "cuda", a shard-by-shard checkpoint load so the fp32 checkpoint is never
held in memory twice, and sigmas read as Python floats in the sampler (on MPS a 0-d CPU tensor view
is read at the wrong offset in mixed-device arithmetic, which re-noised every step). Nothing else
is downloaded or run: only the official code at CODE_COMMIT, its declared dependencies (pinned in
VENV_PACKAGES) and the weights at the revisions below.

Licences (see notices/THIRD_PARTY_NOTICES.md): MagiHuman code Apache-2.0 (file headers; the repo
has no LICENSE file); DiT weights Apache-2.0 (model card); Turbo VAE Apache-2.0 per the model card,
provenance unclear; Wan2.2 VAE Apache-2.0; T5Gemma text encoder under the Gemma Terms of Use; the
audio VAE is Stable Audio Open 1.0 under the
Stability AI Community License (free commercial use only below US$1M annual revenue; Powered by
Stability AI), re-hosted by SII-GAIR under an Apache tag.

Usage (Apple Silicon, ~104 GB of weights, ~45 GB of unified memory at peak, ~14 min per 8 s take on an
M2 Max; uv required):

    python3 -I tools/avatar/generate_mira_ai.py setup               # code + patch, venv, weights
    python3 -I tools/avatar/generate_mira_ai.py generate [seed ...]  # candidates in the cache
    python3 -I tools/avatar/generate_mira_ai.py publish <seed>       # write the committed files

Everything heavy lives in MAGNIFITO_AVATAR_CACHE (default ~/.cache/magnifito-avatar). `generate`
skips seeds whose candidate already exists. Extract frames from a candidate and look at them
(mouth shapes against the words, teeth, eyes, flicker) before publishing it.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PROJECT = REPO / "showcase" / "11-ai-presenter"
CACHE = Path(os.environ.get("MAGNIFITO_AVATAR_CACHE", Path.home() / ".cache" / "magnifito-avatar"))
CODE = CACHE / "code"
VENV = CACHE / "venv"
WEIGHTS = CACHE / "weights"
RUNS = CACHE / "runs"

CODE_URL = "https://github.com/GAIR-NLP/daVinci-MagiHuman"
CODE_COMMIT = "209209b7086eba2020c5439265221495a8357322"
PATCH = HERE / "magihuman-mps.patch"
PYTHON = "3.12"
# The declared dependencies the inference code imports (requirements.txt pins kept where it pins).
VENV_PACKAGES = [
    "torch==2.9.0", "torchvision==0.24.0", "torchaudio==2.9.0", "transformers==4.56.0",
    "accelerate==1.10.1", "timm==1.0.20", "ffmpeg-python==0.2.0", "loguru==0.7.3",
    "diffusers", "einops", "imageio[ffmpeg]", "pydantic", "pydantic-settings", "safetensors",
    "scipy", "soundfile", "tqdm", "unfoldNd", "openai-whisper", "sentencepiece", "ftfy", "pyyaml",
    "huggingface_hub[hf_transfer]",
]
# (repo, revision, local folder, allow_patterns or None for the whole repo)
WEIGHT_REPOS = [
    ("GAIR/daVinci-MagiHuman", "7fe95e50c11bd92bdadf94cd51dbec18427f8e0c", "gair", ["turbo_vae/*", "README.md", "config.json"]),
    ("SII-GAIR/daVinci-MagiHuman-Distill-256p", "e13bade0a867fb0a01f453797cfbc33dbdd1615f", "distill-256p", None),
]

# The voice: Mira's committed Qwen3-TTS take for 07-broll, lines 1 and 2 (0.44-7.38 s), cut at
# 7.70 s (the next line starts at 7.96 s) with a short fade and padded to a whole number of seconds,
# since MagiHuman takes --seconds as an integer.
VOICE_SOURCE = REPO / "showcase" / "07-broll" / "voice" / "mira.wav"
VOICE_CUT = 7.70
SECONDS = 8
LINES = ["At Magnifito, we run your whole funnel.", "Websites, social media, email and ads, all in one plan."]

# 16:9 on the model's 32-pixel latent grid (VAE stride 16 x patch 2), the 256p distilled model.
WIDTH, HEIGHT = 512, 288
SETTINGS = {"model": "distill-256p", "steps": 8, "cfg_number": 1, "fps": 25, "width": WIDTH, "height": HEIGHT}

# Written to the repo's enhanced-prompt format (prompts/enhanced_prompt_design.md in the code):
# a 150-200 word performance paragraph, the dialogue, the background sound. Hands stay out of frame.
PROMPT = f"""A fictional woman in her early thirties with shoulder-length wavy chestnut-brown hair, warm light-olive skin, brown eyes and natural makeup, wearing a cream knit top under a soft caramel-brown blazer, sits centered facing the camera in a bright, minimal studio office with a plain cream wall and warm walnut wood shelves softly out of focus behind her, a small green potted plant at the edge of the frame. Her overall emotional disposition is calm, composed, warm and professional, like a news presenter. She looks directly into the lens with relaxed, fully open eyes and a slight, friendly smile, then begins speaking: her lips move naturally and precisely with each syllable, with moderate, understated mouth movements and no exaggerated expressions, as she says, "{LINES[0]}" in a warm, clear, mid-pitched voice at a relaxed conversational pace and moderate volume. Her eyebrows stay relaxed; she gives a small nod and continues, "{LINES[1]}" with crisp consonants and gentle, natural intonation, her head tilting slightly on the final words, then closes her lips into a soft smile. Her torso and shoulders stay still and her hands remain out of frame. Static medium close-up at eye level, subject centered, shallow depth of field with the face in sharp focus, soft diffused key light from the front left with warm fill, natural warm color grading.
Dialogue:
<Woman in caramel blazer, English>: "{LINES[0]} {LINES[1]}"
Background Sound:
<No prominent background sound>"""

OUT_MP4 = PROJECT / "presenter" / "mira-ai.mp4"
OUT_JSON = PROJECT / "presenter" / "mira-ai.json"


def run(cmd: list[str], **kw) -> None:
    print("+", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, **kw)


def uv() -> str:
    found = shutil.which("uv") or str(Path.home() / ".local" / "bin" / "uv")
    if not Path(found).exists():
        sys.exit("uv not found; install it from https://docs.astral.sh/uv/")
    return found


def setup() -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    if not CODE.exists():
        run(["git", "clone", "-q", CODE_URL, CODE])
    # The checkout is a cache: reset it to the pinned commit, then apply the MPS port.
    run(["git", "-C", CODE, "fetch", "-q", "origin", CODE_COMMIT])
    run(["git", "-C", CODE, "checkout", "-q", "-f", "-B", "magnifito-mps", CODE_COMMIT])
    run(["git", "-C", CODE, "apply", PATCH])
    if not VENV.exists():
        run([uv(), "venv", "-q", "--python", PYTHON, VENV])
    run([uv(), "pip", "install", "-q", "--python", VENV / "bin" / "python", *VENV_PACKAGES])
    for repo, revision, folder, patterns in WEIGHT_REPOS:
        code = (
            "import sys\nfrom huggingface_hub import snapshot_download\n"
            "snapshot_download(sys.argv[1], revision=sys.argv[2], local_dir=sys.argv[3],"
            " allow_patterns=sys.argv[4].split(',') if sys.argv[4] else None, max_workers=8)\n"
        )
        run(
            [VENV / "bin" / "python", "-I", "-c", code, repo, revision, WEIGHTS / folder, ",".join(patterns or [])],
            env={**os.environ, "HF_HUB_ENABLE_HF_TRANSFER": "1"},
        )


def write_config() -> Path:
    d = WEIGHTS / "distill-256p"
    turbo = WEIGHTS / "gair" / "turbo_vae"
    config = {
        "engine_config": {"load": str(d / "transformer"), "distill": True, "cp_size": 1, "distributed_backend": "gloo"},
        "evaluation_config": {
            "cfg_number": SETTINGS["cfg_number"],
            "num_inference_steps": SETTINGS["steps"],
            "audio_model_path": str(d / "audio_vae"),
            "txt_model_path": str(d / "text_encoder"),
            "vae_model_path": str(d / "vae"),
            "use_turbo_vae": True,
            "student_config_path": str(turbo / "TurboV3-Wan22-TinyShallow_7_7.json"),
            "student_ckpt_path": str(turbo / "checkpoint-340000.ckpt"),
        },
    }
    path = RUNS / "config.json"
    path.write_text(json.dumps(config, indent=2))
    return path


def voice() -> Path:
    path = RUNS / f"voice-{SECONDS}s.wav"
    fade = VOICE_CUT - 0.15
    run([
        "ffmpeg", "-v", "error", "-y", "-i", VOICE_SOURCE,
        "-af", f"atrim=0:{VOICE_CUT},afade=t=out:st={fade}:d=0.15,apad=whole_dur={SECONDS}",
        "-ar", "24000", "-ac", "1", path,
    ])
    return path


def candidate(seed: int) -> Path:
    return RUNS / f"seed-{seed}_{SECONDS}s_{WIDTH}x{HEIGHT}.mp4"


def generate(seeds: list[int]) -> None:
    RUNS.mkdir(parents=True, exist_ok=True)
    config, wav = write_config(), voice()
    env = {
        **os.environ,
        "PYTHONPATH": str(CODE),
        "MASTER_ADDR": "localhost", "MASTER_PORT": "6016", "RANK": "0", "WORLD_SIZE": "1",
        "PYTORCH_ENABLE_MPS_FALLBACK": "1",
        "TOKENIZERS_PARALLELISM": "false",
        # The Wan2.2 VAE is wrapped in torch.compile, whose inductor backend fails on MPS; run eagerly.
        "TORCHDYNAMO_DISABLE": "1",
    }
    for seed in seeds:
        if candidate(seed).exists():
            print(f"seed {seed}: cached {candidate(seed)}")
            continue
        started = time.time()
        run(
            [
                # -s, not -I: the official code imports itself through PYTHONPATH.
                VENV / "bin" / "python", "-s", CODE / "inference" / "pipeline" / "entry.py",
                "--config-load-path", config, "--prompt", PROMPT, "--audio_path", wav,
                "--seed", str(seed), "--seconds", str(SECONDS),
                "--br_width", str(WIDTH), "--br_height", str(HEIGHT),
                "--output_path", RUNS / f"seed-{seed}",
            ],
            cwd=RUNS, env=env,
        )
        print(f"seed {seed}: {time.time() - started:.0f} s -> {candidate(seed)}")


def publish(seed: int) -> None:
    src = candidate(seed)
    if not src.exists():
        sys.exit(f"no candidate for seed {seed}; run generate {seed} first")
    OUT_MP4.parent.mkdir(parents=True, exist_ok=True)
    # The model re-synthesises the audio it was conditioned on; the committed clip carries the
    # original voice take instead, which the lips were generated to follow.
    run([
        "ffmpeg", "-v", "error", "-y", "-i", src, "-i", RUNS / f"voice-{SECONDS}s.wav",
        # The model returns 197 frames for 8 s; hold the last frame so video and audio both run 8 s.
        "-map", "0:v", "-map", "1:a", "-vf", "tpad=stop_mode=clone:stop_duration=1", "-t", str(SECONDS),
        "-c:v", "libx264", "-crf", "23", "-preset", "slow", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-movflags", "+faststart", OUT_MP4,
    ])
    meta = {
        "about": "Mira, a fictional presenter: AI-generated by daVinci-MagiHuman from a text prompt and her designed Qwen3-TTS voice. Not a real person, not based on a photo. Written by tools/avatar/generate_mira_ai.py; do not edit by hand.",
        "code": {"url": CODE_URL, "commit": CODE_COMMIT, "patch": "tools/avatar/magihuman-mps.patch"},
        "weights": [{"repo": r, "revision": rev, "files": p or "all"} for r, rev, _, p in WEIGHT_REPOS],
        "prompt": PROMPT,
        "seed": seed,
        "settings": {**SETTINGS, "mode": "text+audio to video", "seconds": SECONDS},
        "voice": {"source": "showcase/07-broll/voice/mira.wav", "cut": [0, VOICE_CUT], "lines": LINES},
        "licences": {
            "code": "Apache-2.0 (file headers; no LICENSE file in the repo)",
            "dit": "Apache-2.0 (model card)",
            "turbo_vae": "Apache-2.0 per the model card; provenance unclear (retrain of hustvl/Turbo-VAED, which states no license)",
            "video_vae": "Wan2.2 VAE, Apache-2.0",
            "text_encoder": "T5Gemma 9B-9B UL2, Gemma Terms of Use",
            "audio_vae": "Stable Audio Open 1.0, Stability AI Community License (under US$1M annual revenue); Powered by Stability AI",
            "voice": "Qwen3-TTS-12Hz-1.7B-VoiceDesign, Apache-2.0",
        },
    }
    OUT_JSON.write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n")
    print(f"{OUT_MP4} ({OUT_MP4.stat().st_size / 1e6:.2f} MB), {OUT_JSON}")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in {"setup", "generate", "publish"}:
        sys.exit(__doc__)
    cmd, args = sys.argv[1], [int(a) for a in sys.argv[2:]]
    if cmd == "setup":
        setup()
    elif cmd == "generate":
        generate(args or [42])
    else:
        if len(args) != 1:
            sys.exit("publish takes exactly one seed")
        publish(args[0])


if __name__ == "__main__":
    main()
