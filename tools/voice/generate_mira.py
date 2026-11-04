"""
Generates the voice of Mira, the fictional presenter in the showcase videos, and writes the
committed voice files the showcase recipes read (they never need the model):

    showcase/<project>/voice/mira.wav    24 kHz mono 16-bit PCM, the whole voice track of the clip
    showcase/<project>/voice/mira.json   timing: every word (start/end in seconds), every placed
                                         segment, and a per-video-frame mouth track (open, wide)
                                         computed from the audio for lip sync

and, for 03-talking-head-edit, the edit inputs that depend on the real word times:
transcript.json (the raw take's word-level transcript) and edl.json (the cut list).

The voice is designed, not cloned: Qwen3-TTS VoiceDesign (Apache-2.0) builds a new voice from the
text description in VOICE below. It is not based on, and must never imitate, a real person.

Pipeline:
  1. every TAKE (a line of text) is synthesised with a fixed seed; candidates are cached outside the
     repo, so re-running is cheap;
  2. each take is checked by measurement, since nobody listens during a batch run: duration and
     speaking rate, peak and clipped samples, the longest silence inside the speech, and a
     speech-to-text pass (faster-whisper) whose words must match the script; the STT word
     timestamps become the per-word timing;
  3. each project's TIMELINE places takes (or word ranges cut from a take at its quietest point
     between two words) and pauses; the result is normalised to LOUDNESS_LUFS with a peak limit.

Usage (Python 3.11/3.12 venv outside the repo, e.g. ~/.cache/magnifito-tts/venv, with the
official `qwen-tts` package, `faster-whisper` and `librosa` installed; Apple Silicon uses MPS):

    python -I tools/voice/generate_mira.py audition <take-id> [seed ...]   # try seeds, print checks
    python -I tools/voice/generate_mira.py build [project ...]             # write the voice files

`audition` lists each candidate's checks; pin the chosen seed in TAKES and run `build`. The model
weights and the venv stay outside the repo; only the outputs above are committed.
"""

from __future__ import annotations

import difflib
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import soundfile as sf

REPO = Path(__file__).resolve().parents[2]
SHOWCASE = REPO / "showcase"
CACHE = Path(os.environ.get("MAGNIFITO_TTS_CACHE", Path.home() / ".cache" / "magnifito-tts")) / "takes"

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
MODEL_REVISION = "5ecdb67327fd37bb2e042aab12ff7391903235d3"
STT_MODEL = "medium.en"  # faster-whisper; used only to check the words and time them
LANGUAGE = "English"
SAMPLE_RATE = 24000  # the model's native rate; the recipes resample when they mux
FPS = 30
LOUDNESS_LUFS = -14.5  # the edits land about 1 LU lower once cut and muxed
PEAK_LIMIT_DBFS = -1.0

# The designed voice. A description of a fictional speaker, not of any real person.
VOICE = (
    "A warm, clear and friendly woman in her early thirties presenting her agency straight to camera. "
    "Mid-pitched, smooth voice with a light, neutral international English accent, crisp articulation "
    "and a relaxed, natural conversational pace. Confident and approachable, smiling slightly as she "
    "speaks, gentle natural intonation, no exaggerated emotion, no vocal fry. Close studio microphone, "
    "clean recording, no background noise."
)


@dataclass(frozen=True)
class Take:
    text: str
    seed: int
    filler: bool = False


# Every line Mira says, with the seed of the chosen take. Seeds were picked with `audition`
# (seeds 1-4 each): no STT mismatch, no clipping, natural rate, and the closest pitch and timbre
# (mean MFCC) to 03-main, so all takes sound like the same speaker. Fillers and the false start are
# separate short takes, so the timeline can place them (and the edit can cut them) exactly.
TAKES: dict[str, Take] = {
    "03-main": Take(
        "Hi, I'm Mira from Magnifito. So, we're a digital marketing agency in Sofia. "
        "We build websites, run social media, email and ads, and we automate the boring parts, "
        "so your team can focus on growth. Let's talk about your next campaign.",
        seed=1,
    ),
    "03-false-start": Take("And we...", seed=1),
    "um": Take("Um...", seed=3, filler=True),
    "uh": Take("Uh...", seed=4, filler=True),
    "07-main": Take(
        "At Magnifito, we run your whole funnel. Websites, social media, email and ads, all in one plan. "
        "Then we automate the follow-up. Every new lead gets a welcome email, and your sales team hears about it.",
        seed=4,
    ),
    "f18-main": Take(
        "Hi, I'm Mira. Today we shot this in front of a green screen, and the set behind me was added afterwards.",
        seed=3,
    ),
    "s-main": Take("We plan every post a month ahead, so the brand sounds like one voice.", seed=3),
}


@dataclass
class Project:
    """A voice track: `timeline` items are ("pause", seconds), ("take", id) or ("take", id, a, b),
    the last one meaning words a..b-1 of the take, cut at the quietest point next to them. A final
    string, e.g. ("take", "um", "Um,"), is how the words are spelled in the transcript there."""

    folders: list[str]
    timeline: list[tuple]
    duration: float | None = None  # fixed clip length; None = end of the timeline, whole frames
    note: str = ""
    extra: list[str] = field(default_factory=list)


# Word indices of 03-main: Hi(0) I'm Mira from Magnifito.(4) So,(5) we're(6) ... Sofia.(12)
# We(13) build websites,(15) run(16) ... ads,(21) and(22) we automate ... can(31) focus(32) on
# growth.(34) Let's(35) ... campaign.(40)
PROJECTS: dict[str, Project] = {
    "03": Project(
        folders=["03-talking-head-edit"],
        note="Raw take: the clean script with an um before \"so\", an uh after \"websites\", a false "
        "start \"and we\" and an um before \"focus\", plus long pauses, for the edit to cut.",
        timeline=[
            ("pause", 0.7), ("take", "03-main", 0, 5),
            ("pause", 1.5), ("take", "um", "Um,"), ("pause", 0.25), ("take", "03-main", 5, 6, "so,"),
            ("pause", 0.35), ("take", "03-main", 6, 13),
            ("pause", 1.3), ("take", "03-main", 13, 16), ("pause", 0.3), ("take", "uh", "uh,"), ("pause", 0.3),
            ("take", "03-main", 16, 22),
            ("pause", 0.9), ("take", "03-false-start", "and we,"), ("pause", 0.5),
            ("take", "03-main", 22, 32), ("pause", 0.3), ("take", "um", "um,"), ("pause", 0.35),
            ("take", "03-main", 32, 35),
            ("pause", 1.2), ("take", "03-main", 35, 41), ("pause", 0.9),
        ],
        extra=["03-edit"],
    ),
    "07": Project(
        folders=["07-broll"],
        duration=15.0,
        note="Four caption lines, one take, with a pause between the lines (longer around the cutaway line).",
        timeline=[
            ("pause", 0.4), ("take", "07-main", 0, 7), ("pause", 0.4),
            ("take", "07-main", 7, 17), ("pause", 0.5),
            ("take", "07-main", 17, 22), ("pause", 0.7),
            ("take", "07-main", 22, 36),
        ],
        extra=["07-broll"],
    ),
    "f18": Project(
        folders=["f18-chromakey"],
        duration=8.0,
        note="One take.",
        timeline=[("pause", 0.4), ("take", "f18-main")],
    ),
    "s": Project(
        folders=["s10-interview-speaker-card", "s11-broll-lower-third", "s12-broll-stat-callout"],
        duration=6.0,
        note="One take, shared by the three style-gallery overlay clips.",
        timeline=[("pause", 0.5), ("take", "s-main")],
    ),
}


# --- model and STT ----------------------------------------------------------------------------

_tts = None
_stt = None


def tts():
    global _tts
    if _tts is None:
        import torch
        from huggingface_hub import snapshot_download
        from qwen_tts import Qwen3TTSModel

        path = snapshot_download(MODEL_ID, revision=MODEL_REVISION)
        if torch.backends.mps.is_available():
            device, dtype = "mps", torch.bfloat16
        elif torch.cuda.is_available():
            device, dtype = "cuda:0", torch.bfloat16
        else:
            device, dtype = "cpu", torch.float32
        _tts = Qwen3TTSModel.from_pretrained(path, device_map=device, dtype=dtype, attn_implementation="sdpa")
    return _tts


def stt():
    global _stt
    if _stt is None:
        from faster_whisper import WhisperModel

        _stt = WhisperModel(STT_MODEL, device="cpu", compute_type="int8")
    return _stt


def take_key(t: Take) -> str:
    blob = json.dumps([MODEL_ID, MODEL_REVISION, VOICE, LANGUAGE, t.text, t.seed])
    return hashlib.sha256(blob.encode()).hexdigest()[:10]


def synthesize(take_id: str, t: Take) -> Path:
    """Cached synthesis of one take; returns the WAV path in the cache."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"{take_id}-{take_key(t)}-s{t.seed}.wav"
    if out.exists():
        return out
    import random

    import torch

    random.seed(t.seed)
    np.random.seed(t.seed)
    torch.manual_seed(t.seed)
    wavs, sr = tts().generate_voice_design(text=t.text, language=LANGUAGE, instruct=VOICE)
    if sr != SAMPLE_RATE:
        raise RuntimeError(f"model returned {sr} Hz, expected {SAMPLE_RATE}")
    sf.write(out, np.asarray(wavs[0], dtype=np.float32), sr, subtype="FLOAT")
    return out


# --- analysis ---------------------------------------------------------------------------------

HOP = 0.01  # analysis hop in seconds


def frame_db(a: np.ndarray, sr: int, win: float = 0.03, hop: float = HOP) -> np.ndarray:
    n, h = int(win * sr), int(hop * sr)
    frames = max(1, 1 + (len(a) - n) // h)
    out = np.empty(frames)
    for i in range(frames):
        seg = a[i * h : i * h + n]
        out[i] = 10 * math.log10(float(np.mean(seg * seg)) + 1e-12)
    return out


def norm_word(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


@dataclass
class Word:
    word: str
    start: float
    end: float
    prob: float
    filler: bool = False


@dataclass
class Analysis:
    audio: np.ndarray  # trimmed take
    words: list[Word]  # script words, timed against the trimmed take
    heard: list[str]
    mismatches: list[str]
    duration: float
    peak_db: float
    clipped: int
    longest_gap: float
    f0: float

    def summary(self) -> str:
        words = len(self.words)
        rate = words / max(0.1, self.duration)
        mm = "; ".join(self.mismatches) if self.mismatches else "none"
        return (
            f"dur {self.duration:5.2f}s  {rate:4.2f} w/s  peak {self.peak_db:5.1f} dBFS  clipped {self.clipped}  "
            f"longest gap {self.longest_gap:4.2f}s  f0 {self.f0:5.1f} Hz  mismatches: {mm}\n"
            f"    heard: {' '.join(self.heard)}"
        )


def analyse(take_id: str, t: Take) -> Analysis:
    raw, sr = sf.read(synthesize(take_id, t), dtype="float32")
    # Trim leading and trailing silence (40 dB under the loudest frame), keeping 40 ms of air.
    db = frame_db(raw, sr)
    voiced = np.where(db > db.max() - 40)[0]
    a0 = max(0, int((voiced[0] * HOP - 0.04) * sr))
    a1 = min(len(raw), int((voiced[-1] * HOP + 0.03 + 0.04) * sr))
    audio = raw[a0:a1].copy()
    dur = len(audio) / sr

    import librosa

    a16 = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    segs, _ = stt().transcribe(
        a16, language="en", beam_size=5, word_timestamps=True, condition_on_previous_text=False,
        initial_prompt="Mira from Magnifito. Um, uh, so...",
    )
    heard = []
    for w in (w for s in segs for w in s.words):
        # Whisper may split a hyphenated word ("follow" "-up"); join it back.
        if heard and w.word.startswith("-"):
            h = heard[-1]
            heard[-1] = type(h)(start=h.start, end=w.end, word=h.word + w.word, probability=min(h.probability, w.probability))
        else:
            heard.append(w)
    script = t.text.split()
    exp = [norm_word(w) for w in script]
    got = [norm_word(w.word) for w in heard]
    timed: list[Word | None] = [None] * len(script)
    mismatches: list[str] = []
    for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, exp, got, autojunk=False).get_opcodes():
        if op == "equal" or (op == "replace" and i2 - i1 == j2 - j1):
            for k in range(i2 - i1):
                h = heard[j1 + k]
                timed[i1 + k] = Word(script[i1 + k], h.start, h.end, h.probability)
            if op == "replace":
                mismatches.append(f"{' '.join(script[i1:i2])} -> {' '.join(w.word.strip() for w in heard[j1:j2])}")
        elif op == "insert":
            mismatches.append(f"extra: {' '.join(w.word.strip() for w in heard[j1:j2])}")
        else:  # delete, or a replace of a different length: interpolate inside the heard span
            if op == "replace":
                mismatches.append(f"{' '.join(script[i1:i2])} -> {' '.join(w.word.strip() for w in heard[j1:j2])}")
                lo, hi = heard[j1].start, heard[j2 - 1].end
            else:
                mismatches.append(f"missing: {' '.join(script[i1:i2])}")
                lo = heard[j1 - 1].end if j1 > 0 else 0.0
                hi = heard[j1].start if j1 < len(heard) else dur
            weights = [max(1, len(e)) for e in exp[i1:i2]]
            pos = lo
            for k, wgt in enumerate(weights):
                step = (hi - lo) * wgt / sum(weights)
                timed[i1 + k] = Word(script[i1 + k], pos, pos + step, 0.0)
                pos += step
    words = [w for w in timed if w is not None]
    # A filler take is one sound: time it by its energy, whatever the STT heard.
    if t.filler:
        db_t = frame_db(audio, sr)
        v = np.where(db_t > db_t.max() - 30)[0]
        words = [Word(script[0], v[0] * HOP, min(dur, v[-1] * HOP + 0.03), heard[0].probability if heard else 0.0, True)]
        mismatches = [] if got and got[0] in ("um", "uh", "umm", "uhh", "hmm", "mm") and len(got) == 1 else (
            [f"filler heard as: {' '.join(w.word.strip() for w in heard) or '(nothing)'}"])
    for w in words:
        w.start, w.end = max(0.0, min(w.start, dur)), max(0.0, min(w.end, dur))

    db_t = frame_db(audio, sr)
    quiet = db_t < db_t.max() - 35
    gap = best = 0
    for q in quiet[int(0.08 / HOP) : len(quiet) - int(0.08 / HOP)]:
        gap = gap + 1 if q else 0
        best = max(best, gap)
    f0, vflag, _ = librosa.pyin(audio, fmin=70, fmax=400, sr=sr, frame_length=2048)
    f0v = f0[vflag & ~np.isnan(f0)]
    return Analysis(
        audio=audio, words=words, heard=[w.word.strip() for w in heard], mismatches=mismatches, duration=dur,
        peak_db=20 * math.log10(float(np.max(np.abs(audio))) + 1e-12), clipped=int(np.sum(np.abs(audio) >= 0.999)),
        longest_gap=best * HOP, f0=float(np.median(f0v)) if len(f0v) else 0.0,
    )


# --- assembly ---------------------------------------------------------------------------------


def split_point(audio: np.ndarray, sr: int, before: Word, after: Word) -> int:
    """Sample index of the quietest 10 ms between two words of a take."""
    lo = max(0.0, min(before.end, after.start) - 0.06)
    hi = min(len(audio) / sr, max(before.end, after.start) + 0.06)
    db = frame_db(audio[int(lo * sr) : int(hi * sr)], sr, win=0.02)
    return int((lo + (int(np.argmin(db)) * HOP + 0.01)) * sr)


def fade(seg: np.ndarray, sr: int, head: bool, tail: bool, ms: float = 8) -> np.ndarray:
    n = min(len(seg) // 2, int(ms / 1000 * sr))
    seg = seg.copy()
    if head and n:
        seg[:n] *= np.linspace(0, 1, n)
    if tail and n:
        seg[-n:] *= np.linspace(1, 0, n)
    return seg


def measure_lufs(audio: np.ndarray, sr: int) -> tuple[float, float]:
    """Integrated loudness (EBU R128) and true peak via ffmpeg."""
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "a.wav"
        sf.write(f, audio, sr, subtype="FLOAT")
        err = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", "-i", str(f), "-af", "ebur128=peak=true", "-f", "null", "-"],
            capture_output=True, text=True, check=True,
        ).stderr
    tail = err[err.rfind("Summary:") :]
    return float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1)), float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", tail).group(1))


def limit(audio: np.ndarray, sr: int, ceiling_db: float) -> np.ndarray:
    with tempfile.TemporaryDirectory() as d:
        src, dst = Path(d) / "in.wav", Path(d) / "out.wav"
        sf.write(src, audio, sr, subtype="FLOAT")
        lim = 10 ** (ceiling_db / 20)
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(src), "-af",
             f"alimiter=limit={lim:.4f}:attack=3:release=60:level=disabled", "-c:a", "pcm_f32le", str(dst)],
            check=True,
        )
        out, _ = sf.read(dst, dtype="float32")
    return out


def mouth_track(audio: np.ndarray, sr: int, frames: int) -> tuple[list[float], list[float]]:
    """Per video frame: `open` 0..1 from the voiced (vowel) band energy, `wide` 0..1 from the
    balance of the second-formant band against the first (ee/i wide, o/u rounded). Sibilants
    keep the mouth narrow. Smoothed with a fast attack and a slower release, like real lips."""
    n_fft = 1024
    win = np.hanning(n_fft)
    freqs = np.fft.rfftfreq(n_fft, 1 / sr)
    low = (freqs >= 250) & (freqs < 1000)
    high = (freqs >= 1000) & (freqs < 3500)
    sib = (freqs >= 4000) & (freqs < 10000)
    body, ratio, hiss = [], [], []
    for f in range(frames):
        c = int(round(f / FPS * sr))
        seg = audio[max(0, c - n_fft // 2) : c + n_fft // 2]
        seg = np.pad(seg, (0, n_fft - len(seg)))
        p = np.abs(np.fft.rfft(seg * win)) ** 2
        el, eh, es = p[low].sum() + 1e-12, p[high].sum() + 1e-12, p[sib].sum() + 1e-12
        body.append(10 * math.log10(el + eh))
        ratio.append(math.log10(eh / el))
        hiss.append(es / (el + eh))
    body = np.array(body)
    ref = np.percentile(body, 98)
    level = np.clip((body - (ref - 32)) / 28, 0, 1)
    # Syllable contrast: how far each frame sits under the loudest frame within +-125 ms. Lips
    # close between syllables even when the overall level stays high.
    r = 4
    peak = np.array([body[max(0, i - r) : i + r + 1].max() for i in range(len(body))])
    contrast = np.clip(1 + (body - peak) / 9, 0, 1)
    raw_open = level * (0.35 + 0.65 * contrast) ** 1.4
    raw_open = np.where(np.array(hiss) > 0.6, raw_open * 0.55, raw_open)
    raw_wide = np.clip((np.array(ratio) + 1.3) / 1.5, 0, 1)
    opened, wide = [], []
    o = w = 0.0
    for x, y in zip(raw_open, raw_wide):
        o += (0.7 if x > o else 0.45) * (x - o)
        w += 0.5 * (y - w) if x > 0.15 else 0.2 * (0.5 - w)
        opened.append(round(float(o), 3))
        wide.append(round(float(w), 3))
    return opened, wide


def build(name: str, p: Project) -> dict:
    sr = SAMPLE_RATE
    cache: dict[str, Analysis] = {}

    def get(tid: str) -> Analysis:
        if tid not in cache:
            cache[tid] = analyse(tid, TAKES[tid])
        return cache[tid]

    pieces: list[np.ndarray] = []
    words: list[dict] = []
    segments: list[dict] = []
    t = 0.0
    for item in p.timeline:
        if item[0] == "pause":
            n = int(round(item[1] * sr))
            pieces.append(np.zeros(n, dtype=np.float32))
            t += n / sr
            continue
        tid = item[1]
        an = get(tid)
        rest = list(item[2:])
        spelled = rest.pop().split() if rest and isinstance(rest[-1], str) else None
        a, b = rest if rest else (0, len(an.words))
        if spelled is not None and len(spelled) != b - a:
            raise SystemExit(f"{name}: spelling {spelled} does not match {b - a} words of {tid}")
        s0 = 0 if a == 0 else split_point(an.audio, sr, an.words[a - 1], an.words[a])
        s1 = len(an.audio) if b == len(an.words) else split_point(an.audio, sr, an.words[b - 1], an.words[b])
        # At a split, drop the take's own pause too (keep 40 ms of air), so the timeline's
        # pauses are the only gaps between lines.
        if a > 0 or b < len(an.words):
            base = s0
            db = frame_db(an.audio[base:s1], sr)
            voiced = np.where(db > frame_db(an.audio, sr).max() - 40)[0]
            if a > 0:
                s0 = base + max(0, int((voiced[0] * HOP - 0.04) * sr))
            if b < len(an.words):
                s1 = min(s1, base + int((voiced[-1] * HOP + 0.07) * sr))
        seg = fade(an.audio[s0:s1], sr, head=a > 0, tail=b < len(an.words))
        off = t - s0 / sr
        for k, w in enumerate(an.words[a:b]):
            words.append({
                "word": spelled[k] if spelled else w.word, "start": round(max(t, w.start + off), 3), "end": round(min(t + len(seg) / sr, w.end + off), 3),
                "confidence": round(w.prob, 2), "filler": w.filler or TAKES[tid].filler,
            })
        # Segment edges are exact (energy-trimmed, 40 ms of air); STT word edges are loose, and
        # STT onsets tend to be late. The first and last word of a segment move out to the
        # segment's voiced edges (the onset by at most 0.15 s, so a breath before a sentence is
        # not counted as the word), so cuts made between segments never clip a word.
        seg_words = words[len(words) - (b - a):]
        seg_words[0]["start"] = round(max(t + 0.04, seg_words[0]["start"] - 0.15), 3)
        seg_words[-1]["end"] = round(t + len(seg) / sr - 0.04, 3)
        for w0, w1 in zip(seg_words, seg_words[1:]):
            w0["end"] = min(w0["end"], w1["start"])
        segments.append({
            "text": " ".join(spelled) if spelled else " ".join(w.word for w in an.words[a:b]), "start": round(t, 3), "end": round(t + len(seg) / sr, 3),
            "take": tid, "seed": TAKES[tid].seed,
        })
        pieces.append(seg.astype(np.float32))
        t += len(seg) / sr

    audio = np.concatenate(pieces)
    if p.duration is not None:
        if len(audio) > int(p.duration * sr):
            raise SystemExit(f"{name}: voice is {len(audio) / sr:.2f} s, longer than the {p.duration} s clip")
        audio = np.pad(audio, (0, int(round(p.duration * sr)) - len(audio)))
    else:
        frames = math.ceil(len(audio) / sr * FPS)
        audio = np.pad(audio, (0, int(round(frames / FPS * sr)) - len(audio)))

    lufs, _ = measure_lufs(audio, sr)
    audio = audio * 10 ** ((LOUDNESS_LUFS - lufs) / 20)
    if 20 * math.log10(float(np.max(np.abs(audio)))) > PEAK_LIMIT_DBFS:
        audio = limit(audio, sr, PEAK_LIMIT_DBFS - 0.3)
    lufs, peak = measure_lufs(audio, sr)
    duration = len(audio) / sr
    frames = int(round(duration * FPS))
    opened, wide = mouth_track(audio, sr, frames)

    lines, cur = [], []
    for w in words:
        cur.append(w)
        if re.search(r"[.!?]$", w["word"]) or w is words[-1]:
            lines.append({"text": " ".join(x["word"] for x in cur), "start": cur[0]["start"], "end": cur[-1]["end"]})
            cur = []

    meta = {
        "about": "Voice of Mira, a fictional presenter. AI-generated with Qwen3-TTS VoiceDesign (Apache-2.0): "
        "a designed voice from the text description below, not based on a real person. "
        "Written by tools/voice/generate_mira.py; do not edit by hand.",
        "model": {"id": MODEL_ID, "revision": MODEL_REVISION, "language": LANGUAGE, "voice_description": VOICE},
        "stt_check": f"faster-whisper {STT_MODEL}",
        "note": p.note,
        "sample_rate": sr,
        "duration": round(duration, 3),
        "loudness_lufs": lufs,
        "true_peak_dbfs": peak,
        "lines": lines,
        "segments": segments,
        "words": words,
        "mouth": {"fps": FPS, "open": opened, "wide": wide},
    }
    for folder in p.folders:
        out = SHOWCASE / folder / "voice"
        out.mkdir(parents=True, exist_ok=True)
        sf.write(out / "mira.wav", audio, sr, subtype="PCM_16")
        (out / "mira.json").write_text(json.dumps(meta, indent=1) + "\n")
    if "03-edit" in p.extra:
        write_03_edit(meta)
    if "07-broll" in p.extra:
        write_07_broll(meta)
    takes = {tid: cache[tid] for tid in cache}
    print(f"\n{name}: {duration:.2f} s, {lufs:.1f} LUFS, true peak {peak:.1f} dBFS -> {', '.join(p.folders)}")
    for tid, an in takes.items():
        print(f"  {tid} (seed {TAKES[tid].seed}): {an.summary()}")
    return meta


# --- 03: transcript and cut list from the real word times --------------------------------------


def write_03_edit(meta: dict) -> None:
    """transcript.json (raw take, word level) and edl.json for 03-talking-head-edit.

    The cut rules are the ones the showcase prompt gives: remove the fillers, the false start and
    every pause longer than 0.6 s, never cut into a word. A kept range starts 0.08 s before its
    first word and ends 0.12 s after its last one, on whole frames."""
    folder = SHOWCASE / "03-talking-head-edit"
    words = meta["words"]
    (folder / "transcript.json").write_text(json.dumps({
        "schema_version": "1.0.0",
        "source_audio_hash": "qwen3-tts-mira-raw-take-v1",
        "language": "en",
        "correction_version": "v1",
        "words": [
            {"word": w["word"], "start_ms": round(w["start"] * 1000), "end_ms": round(w["end"] * 1000),
             "confidence": w["confidence"] if w["confidence"] > 0 else 0.5, "speaker": "Mira"}
            for w in words
        ],
    }, indent=2) + "\n")

    # Removed words: fillers, the "so" that hangs off the first um, and the false start.
    seg_of = {}
    for i, w in enumerate(words):
        seg_of[i] = next(s for s in meta["segments"] if s["start"] - 1e-3 <= w["start"] <= s["end"] + 1e-3)
    removed = set()
    for i, w in enumerate(words):
        if w["filler"] or seg_of[i]["take"] == "03-false-start":
            removed.add(i)
    so = next(i for i, w in enumerate(words) if norm_word(w["word"]) == "so")
    removed.add(so)

    groups: list[list[int]] = []
    for i in range(len(words)):
        if i in removed:
            continue
        if groups and groups[-1][-1] == i - 1 and words[i]["start"] - words[i - 1]["end"] <= 0.6:
            groups[-1].append(i)
        else:
            groups.append([i])

    def frame(sec: float, up: bool) -> int:
        return math.ceil(sec * FPS - 1e-9) if up else math.floor(sec * FPS + 1e-9)

    def label(idx: list[int]) -> str:
        return " ".join(words[i]["word"].rstrip(",.") for i in idx).lower()

    cuts = []
    out_frame = 0
    for gi, g in enumerate(groups):
        a = frame(words[g[0]]["start"] - 0.08, up=False)
        b = frame(words[g[-1]]["end"] + 0.12, up=True)
        if gi == 0:
            reason = "Opening line; lead-in silence trimmed"
        else:
            prev = groups[gi - 1][-1]
            gone = [i for i in range(prev + 1, g[0]) if i in removed]
            span = words[g[0]]["start"] - words[prev]["end"]
            nxt = words[g[0]]["word"].rstrip(",.")
            if not gone:
                reason = f"Shortened a {span:.1f} s pause before \"{nxt}\""
            elif any(seg_of[i]["take"] == "03-false-start" for i in gone):
                reason = f"Removed false start \"{label(gone)}\" with its pauses ({span:.1f} s) before \"{nxt}\""
            else:
                reason = f"Removed filler \"{label(gone).replace(' ', ', ')}\" with its pauses ({span:.1f} s) before \"{nxt}\""
        n = b - a
        cuts.append({
            "cut_id": f"cut-{gi + 1:02d}",
            "source_start_us": round(a * 1e6 / FPS), "source_end_us": round(b * 1e6 / FPS),
            "output_start_frame": out_frame, "output_end_frame": out_frame + n,
            "speed_factor": 1, "reason": reason,
        })
        out_frame += n
    # A kept range may never reach into a removed word.
    for c in cuts:
        for i in removed:
            ws, we = words[i]["start"] * 1e6, words[i]["end"] * 1e6
            if ws < c["source_end_us"] and we > c["source_start_us"]:
                raise SystemExit(f"{c['cut_id']} overlaps removed word {words[i]['word']}")
    (folder / "edl.json").write_text(json.dumps({
        "schema_version": "1.0.0",
        "timing_authority": "speech",
        "source_media_hash": "qwen3-tts-mira-raw-take-v1",
        "source_duration_us": round(meta["duration"] * 1e6),
        "output_fps": {"numerator": FPS, "denominator": 1},
        "cuts": cuts,
    }, indent=2) + "\n")
    print(f"  03 edit: {len(cuts)} kept ranges, {out_frame / FPS:.2f} s of {meta['duration']:.2f} s")


# --- 07: captions and B-roll windows from the real line times --------------------------------


def srt_time(sec: float) -> str:
    ms = int(round(sec * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def write_07_broll(meta: dict) -> None:
    """captions.srt (one cue per spoken line, at its measured start and end) and the in/out of
    each plan.json clip, so every B-roll card lands on the line it shows: a panel opens 0.5 s
    before its line, the cutaway 0.1 s before, and each one closes before the next opens."""
    folder = SHOWCASE / "07-broll"
    lines = meta["lines"]
    if len(lines) != 4:
        raise SystemExit(f"07: expected 4 caption lines, got {len(lines)}")
    (folder / "captions.srt").write_text("\n".join(
        f"{i + 1}\n{srt_time(l['start'])} --> {srt_time(l['end'])}\n{l['text']}\n" for i, l in enumerate(lines)))
    plan_file = folder / "plan.json"
    text = plan_file.read_text()
    plan = json.loads(text)
    clips = {c["id"]: c for c in plan["clips"]}
    _, l2, l3, l4 = lines
    for cid, line in (("01", l2), ("02", l3), ("03", l4)):
        if clips[cid]["line"] != line["text"]:
            raise SystemExit(f"07: clip {cid} line {clips[cid]['line']!r} != spoken {line['text']!r}")
    r = lambda x: round(x, 2)  # noqa: E731
    clips["01"]["in"] = r(l2["start"] - 0.5)
    clips["02"]["in"] = r(l3["start"] - 0.1)
    clips["01"]["out"] = r(min(l2["end"] + 0.2, clips["02"]["in"] - 0.1))
    clips["03"]["in"] = r(l4["start"] - 0.2)
    clips["02"]["out"] = r(min(l3["end"] + 0.4, clips["03"]["in"] - 0.1))
    clips["03"]["out"] = r(min(meta["duration"] - 0.1, l4["end"] + 0.5))
    # Rewrite only the in/out numbers, keeping the file's hand formatting.
    for c in plan["clips"]:
        pat = re.compile(r'("id": "%s".*?"in": )[\d.]+(,\s*"out": )[\d.]+' % re.escape(c["id"]), re.S)
        text, n = pat.subn(lambda m, c=c: f"{m.group(1)}{c['in']}{m.group(2)}{c['out']}", text, count=1)
        if n != 1:
            raise SystemExit(f"07: could not update clip {c['id']} in plan.json")
    plan_file.write_text(text)
    print("  07: captions.srt and plan.json windows " + ", ".join(f"{c['id']} {c['in']}-{c['out']}" for c in plan["clips"]))


# --- CLI --------------------------------------------------------------------------------------


def main(argv: list[str]) -> None:
    if not argv or argv[0] not in ("audition", "build"):
        print(__doc__)
        raise SystemExit(2)
    if argv[0] == "audition":
        tid = argv[1]
        seeds = [int(s) for s in argv[2:]] or [TAKES[tid].seed]
        for s in seeds:
            t = Take(TAKES[tid].text, s, TAKES[tid].filler)
            print(f"{tid} seed {s}: {analyse(tid, t).summary()}", flush=True)
        return
    names = argv[1:] or list(PROJECTS)
    for n in names:
        build(n, PROJECTS[n])


if __name__ == "__main__":
    main(sys.argv[1:])
