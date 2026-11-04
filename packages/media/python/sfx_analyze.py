#!/usr/bin/env python3
"""Sound-pass analysis helper for `mgvideo sfx`.

Only the measurements that need librosa live here; placement, mixing, loudness and
reports are orchestrated by packages/media/src/sfx_pass.ts.

Method: the measured sound pass by Vox (@Voxyz_ai,
https://x.com/Voxyz_ai/status/2109358372873183564). Ported from Barty-Bart/motion-graphics
skills/sound-effects/scripts/sound_pass.py (code MIT, Barty-Bart).

Usage: python -I sfx_analyze.py [--music track] [--sound file ...]
Prints one JSON object on stdout. Exit code 2 on bad input.
"""
import argparse
import json
import math
import sys

import librosa
import numpy as np
from scipy.signal import butter, find_peaks, sosfiltfilt

SR = 48000
LOWPASS_HZ = 120
HOP = 240
# Upstream shifts the whole grid when the kicks sit more than 30 ms off the librosa beats.
SHIFT_THRESHOLD_S = 0.03
ENVELOPE_POINTS = 800


def db(x):
    return float(20 * math.log10(x)) if x > 1e-12 else -120.0


def levels(y):
    """Peak and RMS in dBFS of a (channels, samples) or (samples,) array."""
    a = np.asarray(y, dtype=np.float64)
    return {"peak_dbfs": round(db(float(np.max(np.abs(a))) if a.size else 0.0), 2),
            "rms_dbfs": round(db(float(np.sqrt(np.mean(a * a))) if a.size else 0.0), 2)}


def analyze_music(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    if y.size < SR:
        raise ValueError(f"music track is shorter than 1 s: {path}")
    tempo, bf = librosa.beat.beat_track(y=y, sr=SR)
    beats = librosa.frames_to_time(bf, sr=SR)
    if beats.size < 2:
        raise ValueError("librosa found fewer than 2 beats; the track has no usable beat grid")
    period = float(np.median(np.diff(beats)))

    # Sub-120 Hz check: low-pass, take the envelope, pick kick peaks, compare to the grid.
    low = sosfiltfilt(butter(4, LOWPASS_HZ, "low", fs=SR, output="sos"), y)
    env = np.abs(low)
    envd = env[: len(env) // HOP * HOP].reshape(-1, HOP).max(1)
    te = np.arange(len(envd)) * HOP / SR
    distance = max(1, int(period * 0.6 * SR / HOP))
    pk, _ = find_peaks(envd, height=envd.max() * 0.5, distance=distance) if envd.size and envd.max() > 0 else (np.array([], dtype=int), None)
    kicks = te[pk]
    offsets = np.array([kicks[np.argmin(np.abs(kicks - b))] - b for b in beats]) if kicks.size else np.array([])
    median = float(np.median(offsets)) if offsets.size else 0.0
    shifted = abs(median) > SHIFT_THRESHOLD_S
    grid = beats + median if shifted else beats.copy()

    total = float(np.sum(y.astype(np.float64) ** 2))
    low_ratio = float(np.sum(low.astype(np.float64) ** 2) / total) if total > 0 else 0.0

    # Envelope for the first 4 bars, downsampled, so the report can draw the grid check.
    w = 16 * period
    m = te < w
    ev, et = envd[m], te[m]
    step = max(1, int(math.ceil(len(ev) / ENVELOPE_POINTS)))
    peak_env = float(ev.max()) if ev.size else 0.0

    return {
        "path": path,
        "duration_s": round(len(y) / SR, 3),
        "tempo_bpm": round(float(np.atleast_1d(tempo)[0]), 2),
        "beat_period_s": round(period, 4),
        "beats_s": [round(float(b), 4) for b in beats],
        "grid_s": [round(float(b), 4) for b in grid],
        "kicks_s": [round(float(k), 4) for k in kicks],
        "kick_offset_median_s": round(median, 4),
        "grid_shifted": bool(shifted),
        "sub120_energy_ratio": round(low_ratio, 4),
        "levels": levels(y),
        "envelope": {
            "window_s": round(float(w), 3),
            "t": [round(float(x), 3) for x in et[::step]],
            "v": [round(float(x) / peak_env, 4) if peak_env > 0 else 0.0 for x in ev[::step]],
        },
    }


def analyze_sound(path):
    y, _ = librosa.load(path, sr=SR, mono=False)
    y = np.atleast_2d(y)
    return {"path": path, "duration_s": round(y.shape[1] / SR, 4), "channels": int(y.shape[0]), **levels(y)}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--music", default=None)
    ap.add_argument("--sound", action="append", default=[])
    a = ap.parse_args()
    try:
        out = {"tool": "sfx_analyze", "version": 1, "sample_rate": SR,
               "librosa": librosa.__version__, "numpy": np.__version__}
        out["music"] = analyze_music(a.music) if a.music else None
        out["sounds"] = [analyze_sound(p) for p in a.sound]
    except Exception as e:  # report every failure as JSON so the TS side can show it
        json.dump({"error": f"{type(e).__name__}: {e}"}, sys.stdout)
        sys.stdout.write("\n")
        return 2
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
