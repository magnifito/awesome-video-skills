#!/usr/bin/env python3
"""Speech recognition helper for `mgvideo transcribe`.

Runs faster-whisper (CTranslate2) locally with word timestamps. Nothing leaves the machine; the
model downloads once into the Hugging Face cache.

Usage (JSON on stdout, progress on stderr):
  transcribe.py --audio FILE.wav [--language bg] [--model large-v3-turbo]

Output: {"language", "language_probability", "duration", "model", "device",
         "words": [{"word", "start", "end", "probability"}]}  (times in seconds)
"""

import argparse
import json
import sys
import wave


def read_wav(path: str):
    """16 kHz mono PCM16 WAV (written by mgvideo with ffmpeg) as float32 samples.

    Decoding here keeps PyAV out of the path: faster-whisper 1.2.1 calls av.open() with an
    argument that newer PyAV releases removed.
    """
    import numpy as np

    with wave.open(path, "rb") as f:
        if f.getnchannels() != 1 or f.getsampwidth() != 2 or f.getframerate() != 16000:
            raise SystemExit(f"expected 16 kHz mono PCM16 WAV, got {f.getnchannels()} ch, {f.getframerate()} Hz")
        data = f.readframes(f.getnframes())
    return np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--language", default=None)
    ap.add_argument("--model", default="large-v3-turbo")
    args = ap.parse_args()

    import ctranslate2
    from faster_whisper import WhisperModel

    if ctranslate2.get_cuda_device_count() > 0:
        device, compute = "cuda", "float16"
    else:
        device, compute = "cpu", "int8"
    print(f"loading {args.model} on {device} ({compute})", file=sys.stderr, flush=True)
    model = WhisperModel(args.model, device=device, compute_type=compute)

    segments, info = model.transcribe(
        read_wav(args.audio),
        language=args.language,
        word_timestamps=True,
        vad_filter=True,
        beam_size=5,
        # Each segment decodes on its own; avoids repeated phrases carried across segments.
        condition_on_previous_text=False,
    )
    words = []
    for seg in segments:
        print(f"  {seg.end:7.2f} s", file=sys.stderr, flush=True)
        for w in seg.words or []:
            text = w.word.strip()
            if text:
                words.append({"word": text, "start": w.start, "end": w.end, "probability": w.probability})

    json.dump(
        {
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "model": args.model,
            "device": device,
            "words": words,
        },
        sys.stdout,
        ensure_ascii=False,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
