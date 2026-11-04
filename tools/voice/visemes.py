"""
Phoneme and viseme timing for Mira's lip sync, computed once from the committed voice files so the
showcase renders stay pure Node with no model:

    showcase/<project>/voice/mira.json   gains a "visemes" block: every phoneme of every spoken
                                         word with start/end seconds and its mouth shape, plus the
                                         stressed syllables (emphasis) that drive brows and nods

How it works (no neural model, deterministic):
  1. pronunciation: each word from the Whisper word list is looked up in CMUdict (Carnegie Mellon
     Pronouncing Dictionary, BSD-2-Clause, pinned commit below, downloaded once into the cache
     outside the repo); the few names it lacks are spelled in PRONOUNCE below;
  2. timing: inside each word span, the vowels (syllable nuclei) are pinned to the loudest peaks
     of the voiced-band energy envelope of mira.wav, in order; consonants share the gaps between
     nuclei weighted by phoneme class (stops short, fricatives and nasals longer), so a word's
     closures land in its energy dips. Words with fewer peaks than vowels fall back to a
     class-weighted spread over the whole word;
  3. visemes: each phoneme maps to one of ten mouth shapes (VISEME); the renderer blends
     neighbouring shapes and scales the jaw with the existing per-frame `mouth.open` envelope.

Usage (the same venv as generate_mira.py; needs numpy and soundfile only):

    python -I tools/voice/visemes.py [folder ...]   # update voice/mira.json in place from mira.wav

generate_mira.py `build` calls compute() too, so a rebuilt voice always carries its visemes.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sys
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

REPO = Path(__file__).resolve().parents[2]
SHOWCASE = REPO / "showcase"
CACHE = Path(os.environ.get("MAGNIFITO_TTS_CACHE", Path.home() / ".cache" / "magnifito-tts")) / "cmudict"

CMUDICT_COMMIT = "74790861f652b15e4ac49015a90074ad62a27690"
CMUDICT_URL = f"https://raw.githubusercontent.com/cmusphinx/cmudict/{CMUDICT_COMMIT}/cmudict.dict"
CMUDICT_SHA256 = "81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22"

# Words CMUdict does not list (ARPAbet, stress digits on vowels).
PRONOUNCE = {
    "magnifito": "M AE2 G N IH0 F IY1 T OW0",
}

# Ten mouth shapes (a Preston Blair style set):
#   rest  lips together, relaxed (silence)       MBP  lips pressed (m, b, p)
#   FV    lower lip under the upper teeth        L    tongue tip behind the teeth (l, th, n, t, d)
#   S     teeth together, lips apart (s, z, ch, j, sh, k, g, y, ng)
#   AA    jaw open (a in "father", "cat", "but") E    mid open, wide (e in "bed", "say")
#   I     narrow and wide (ee, i)                 O    round open (o in "go", "thought")
#   U     small pucker (oo, w, r, er)
VISEME = {
    "AA": "AA", "AE": "AA", "AH": "AA", "AY": "AA", "AW": "AA", "HH": "AA",
    "EH": "E", "EY": "E",
    "IH": "I", "IY": "I", "Y": "I",
    "AO": "O", "OW": "O", "OY": "O",
    "UH": "U", "UW": "U", "W": "U", "R": "U", "ER": "U",
    "M": "MBP", "B": "MBP", "P": "MBP",
    "F": "FV", "V": "FV",
    "L": "L", "TH": "L", "DH": "L", "N": "L", "T": "L", "D": "L",
    "S": "S", "Z": "S", "SH": "S", "ZH": "S", "CH": "S", "JH": "S", "K": "S", "G": "S", "NG": "S",
}
# Diphthongs glide into a second mouth shape ("I" ends in ee, "go" ends in oo).
OFFGLIDE = {"AY": "I", "EY": "I", "OY": "I", "AW": "U", "OW": "U"}
VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}
# Relative duration weight per phoneme class (vowels are pinned to peaks; these share the gaps).
WEIGHT = {"vowel": 1.6, "stop": 0.7, "fric": 1.0, "nasal": 0.9, "liquid": 0.8, "glide": 0.7}
STOPS = {"P", "B", "T", "D", "K", "G", "CH", "JH"}
FRICS = {"F", "V", "TH", "DH", "S", "Z", "SH", "ZH", "HH"}
NASALS = {"M", "N", "NG"}
LIQUIDS = {"L", "R"}

HOP = 0.005  # envelope hop in seconds
_dict: dict[str, list[str]] | None = None


def cmudict() -> dict[str, list[str]]:
    """The pinned CMUdict, downloaded once into the cache (outside the repo) and hash-checked."""
    global _dict
    if _dict is not None:
        return _dict
    path = CACHE / "cmudict.dict"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(CMUDICT_URL, path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != CMUDICT_SHA256:
        raise SystemExit(f"cmudict.dict sha256 {digest} != pinned {CMUDICT_SHA256}")
    out: dict[str, list[str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("#")[0].split()
        if not parts:
            continue
        word = re.sub(r"\(\d+\)$", "", parts[0])
        out.setdefault(word, parts[1:])  # the first listed pronunciation
    _dict = out
    return out


def phones_of(word: str) -> list[str]:
    """ARPAbet phones of a transcript word ("Websites," -> W EH1 B S AY2 T S); hyphenated words
    are looked up part by part."""
    out: list[str] = []
    for part in re.split(r"[-\s]+", word.lower()):
        key = re.sub(r"[^a-z']", "", part).strip("'")
        if not key:
            continue
        if key in PRONOUNCE:
            out += PRONOUNCE[key].split()
        elif key in cmudict():
            out += cmudict()[key]
        else:
            raise SystemExit(f"no pronunciation for {key!r}: add it to PRONOUNCE in tools/voice/visemes.py")
    return out


def base(p: str) -> str:
    return re.sub(r"\d", "", p)


def klass(p: str) -> str:
    b = base(p)
    if b in VOWELS:
        return "vowel"
    if b in STOPS:
        return "stop"
    if b in FRICS:
        return "fric"
    if b in NASALS:
        return "nasal"
    if b in LIQUIDS:
        return "liquid"
    return "glide"


def envelope(audio: np.ndarray, sr: int) -> np.ndarray:
    """Voiced-band (250-3500 Hz) energy in dB every HOP seconds, lightly smoothed."""
    n_fft = 512
    h = int(HOP * sr)
    win = np.hanning(n_fft)
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    band = (freqs >= 250) & (freqs < 3500)
    frames = 1 + len(audio) // h
    padded = np.pad(audio, (n_fft // 2, n_fft))
    env = np.empty(frames)
    for i in range(frames):
        seg = padded[i * h : i * h + n_fft]
        p = np.abs(np.fft.rfft(seg * win)) ** 2
        env[i] = 10 * math.log10(float(p[band].sum()) + 1e-12)
    kernel = np.hanning(7)
    kernel /= kernel.sum()
    return np.convolve(env, kernel, mode="same")


def nuclei(env: np.ndarray, a: float, b: float, count: int) -> list[float] | None:
    """`count` syllable peaks (seconds) inside [a, b], in time order, or None if the envelope
    does not show that many distinct peaks (at least 70 ms apart, 3 dB above the dip between)."""
    i0, i1 = max(1, int(a / HOP)), min(len(env) - 1, int(b / HOP))
    if i1 - i0 < 3:
        return None
    cand = [i for i in range(i0, i1) if env[i] >= env[i - 1] and env[i] >= env[i + 1]]
    cand.sort(key=lambda i: -env[i])
    picked: list[int] = []
    for i in cand:
        if all(abs(i - j) * HOP >= 0.07 and env[i] - env[min(i, j) : max(i, j) + 1].min() >= 3 for j in picked):
            picked.append(i)
        if len(picked) == count:
            break
    if len(picked) < count:
        return None
    return [i * HOP for i in sorted(picked)]


def spread(phones: list[str], a: float, b: float) -> list[tuple[float, float]]:
    """Class-weighted split of [a, b] over the phones."""
    w = [WEIGHT[klass(p)] for p in phones]
    total = sum(w)
    out, t = [], a
    for x in w:
        d = (b - a) * x / total
        out.append((t, t + d))
        t += d
    return out


def align_word(phones: list[str], a: float, b: float, env: np.ndarray) -> list[tuple[float, float]]:
    vowel_idx = [i for i, p in enumerate(phones) if klass(p) == "vowel"]
    peaks = nuclei(env, a, b, len(vowel_idx)) if vowel_idx else None
    if not peaks:
        return spread(phones, a, b)
    # Anchor each vowel centre on its peak; consonant runs fill the gaps between anchors.
    anchors = [(a, -1)] + [(t, i) for t, i in zip(peaks, vowel_idx)] + [(b, len(phones))]
    times: list[tuple[float, float] | None] = [None] * len(phones)
    for (t0, i0), (t1, i1) in zip(anchors, anchors[1:]):
        run = list(range(i0 + 1, i1))
        # The anchored vowels own part of the gap on each side.
        left = 0.0 if i0 < 0 else WEIGHT["vowel"] / 2
        right = 0.0 if i1 >= len(phones) else WEIGHT["vowel"] / 2
        ws = [left] + [WEIGHT[klass(phones[k])] for k in run] + [right]
        total = sum(ws) or 1.0
        edges = [t0]
        for x in ws:
            edges.append(edges[-1] + (t1 - t0) * x / total)
        if i0 >= 0:
            s, _ = times[i0] or (t0, t0)
            times[i0] = (s, edges[1])
        for k, idx in enumerate(run):
            times[idx] = (edges[k + 1], edges[k + 2])
        if i1 < len(phones):
            times[i1] = (edges[-2], t1)
    spans = [list(x) for x in times]  # type: ignore[arg-type]
    # Lip closures and lip-teeth contacts must be visible: at least 55 ms, taken from neighbours
    # (each neighbour keeps at least 25 ms).
    for k, p in enumerate(phones):
        if VISEME[base(p)] not in ("MBP", "FV"):
            continue
        need = 0.055 - (spans[k][1] - spans[k][0])
        for side in (-1, 1):
            j = k + side
            if need <= 0 or not 0 <= j < len(phones):
                continue
            give = min(need / (2 if side < 0 else 1), max(0.0, spans[j][1] - spans[j][0] - 0.025))
            if side < 0:
                spans[j][1] -= give
                spans[k][0] -= give
            else:
                spans[j][0] += give
                spans[k][1] += give
            need -= give
    return [(round(s, 3), round(e, 3)) for s, e in spans]


def compute(audio: np.ndarray, sr: int, words: list[dict]) -> dict:
    """The "visemes" block for mira.json from the audio and its word list."""
    env = envelope(audio, sr)
    loud = float(np.percentile(env, 98))
    phones_out: list[list] = []
    emphasis: list[list] = []
    for w in words:
        phones = phones_of(w["word"])
        if not phones:
            continue
        spans = align_word(phones, float(w["start"]), float(w["end"]), env)
        for p, (s, e) in zip(phones, spans):
            glide = OFFGLIDE.get(base(p))
            if glide:
                # Diphthongs: the first 60 % on the nucleus shape, the rest on the off-glide.
                m = round(s + (e - s) * 0.6, 3)
                phones_out += [[s, m, base(p), VISEME[base(p)]], [m, e, base(p), glide]]
            else:
                phones_out.append([s, e, base(p), VISEME[base(p)]])
            # Primary-stressed vowels of words longer than one phone count as emphasis when they
            # are loud; strength 0..1 from the level under the clip's loudest speech.
            if p.endswith("1") and len(phones) > 2 and not w.get("filler"):
                i0, i1 = int(s / HOP), max(int(s / HOP) + 1, int(e / HOP))
                level = float(env[i0:i1].max()) - loud
                strength = max(0.0, min(1.0, 1 + level / 12))
                if strength > 0.35:
                    emphasis.append([round((s + e) / 2, 3), round(strength, 2)])
    return {
        "about": "Phoneme timing for lip sync, written by tools/voice/visemes.py from this folder's "
        "mira.wav and word list (CMUdict pronunciations, vowels pinned to the energy envelope). "
        "phones: [start, end, ARPAbet phone, viseme] (diphthongs as two rows); emphasis: [time, strength] of loud stressed syllables.",
        "pronunciations": f"CMUdict {CMUDICT_COMMIT[:12]} (BSD-2-Clause)",
        "set": ["rest", "MBP", "FV", "L", "S", "AA", "E", "I", "O", "U"],
        "phones": phones_out,
        "emphasis": emphasis,
    }


def update(folder: str) -> None:
    voice = SHOWCASE / folder / "voice"
    meta = json.loads((voice / "mira.json").read_text())
    audio, sr = sf.read(voice / "mira.wav", dtype="float32")
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    meta["visemes"] = compute(audio, sr, meta["words"])
    (voice / "mira.json").write_text(json.dumps(meta, indent=1) + "\n")
    v = meta["visemes"]
    print(f"{folder}: {len(v['phones'])} phones, {len(v['emphasis'])} emphasis points")


def main(argv: list[str]) -> None:
    folders = argv or sorted(p.parent.parent.name for p in SHOWCASE.glob("*/voice/mira.json"))
    for f in folders:
        update(f)


if __name__ == "__main__":
    main(sys.argv[1:])
