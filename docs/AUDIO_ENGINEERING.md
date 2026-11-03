# Magnifito Audio Engineering Standards

The Magnifito platform adheres to broadcast television and streaming digital audio standards, guaranteeing clear vocal intelligibility, compliant loudness targets, and zero third-party licensing spend.

---

## 1. Loudness Compliance Standards

All deliverables are normalized according to the **EBU R128** / **ITU-R BS.1770-4** recommendation:

| Parameter | Specification | Compliance Range | Target Delivery |
|---|---|---|---|
| **Integrated Loudness** | `-16.0 LUFS` | `±0.5 LUFS` | YouTube, TikTok, Instagram, Apple Podcasts |
| **Broadcast Television** | `-23.0 LUFS` | `±0.5 LUFS` | EBU R128 European TV Broadcast |
| **Maximum True Peak** | `-1.0 dBTP` | Ceiling `-1.0 dBFS` | Prevents inter-sample DAC clipping |
| **Loudness Range (LRA)** | `< 10.0 LU` | Max `12.0 LU` | Consistent dialogue dynamics for mobile playback |
| **Sample Rate** | `48,000 Hz` | Fixed `48 kHz` | Standard broadcast audio clock |
| **Bit Depth** | `24-bit PCM` / `192 kbps AAC` | Stereo / 5.1 | Client archive vs web delivery |

```bash
# Normalize audio file to -16 LUFS
mgvideo inspect master.mp4 # reports integrated LUFS and True Peak
```

---

## 2. Vocal Processing Chain

When mixing spoken dialogue or voiceovers, the following sequential processing pipeline is applied:

```mermaid
flowchart LR
    RawAudio["Raw Voiceover Recording"]
    DeClick["1. De-Clicker (adeclick)"]
    Silence["2. Silence Removal (silenceremove)"]
    NoiseGate["3. Noise Gate (agate -40dB)"]
    EQ["4. Equalizer (80Hz Highpass + Vocal Presence)"]
    Compressor["5. Dynamics Compressor (acompressor)"]
    Normalizer["6. Loudness Normalizer (-16 LUFS)"]

    RawAudio --> DeClick
    DeClick --> Silence
    Silence --> NoiseGate
    NoiseGate --> EQ
    EQ --> Compressor
    Compressor --> Normalizer
```

### 1. De-Clicking (`DeClickerEngine`)
- Removes impulsive mouth sounds, lip-smacks, and electrical clicks using FFmpeg's `adeclick` filter (`window=55:overlap=75:threshold=2`).

### 2. Silence Removal (`AudioSilenceRemover`)
- Eliminates dead air and prolonged pauses using `silenceremove` (`start_threshold=-38dB:stop_threshold=-38dB:stop_duration=0.4s`).

### 3. Noise Gating (`NoiseGateEngine`)
- Mutes background HVAC hum, fan noise, and room reflections when the speaker is not talking via `agate` (`threshold=-40dB:ratio=4.0:attack=20ms:release=250ms`).

### 4. Equalization (`AudioEqualizerEngine`)
- Highpass filter at `80 Hz` removes table thumps and microphone proximity plosives.
- Peak boost at `2500 Hz` (`+3.0 dB`, `Q=1.5`) enhances vocal intelligibility.
- High-shelf boost at `10,000 Hz` (`+2.0 dB`) adds subtle modern air.
- De-essing notch at `7200 Hz` (`-4.5 dB`, `Q=2.0`) tames harsh sibilance.

### 5. Dynamics Compression (`AudioCompressor`)
- Smooths dynamic variations with `vocal-leveler` preset (`threshold=-22dB:ratio=4.0:attack=8ms:release=120ms:makeup=+3.5dB`).

---

## 3. Sidechain Ducking Architecture

Background music must automatically yield when spoken dialogue is present to prevent vocal masking:

```
[Music Stream] ──> [Sidechain Compressor: acompressor] ──> [Ducked Music] ──┐
                         ▲                                                  ├──> [Master Mix]
[Dialogue Stream] ───────┴──────────────────────────────────────────────────┘
```

- When speech is detected above `threshold = 0.12`, music gain is automatically attenuated by `ratio = 4.0:1`.
- Fast attack (`20ms`) prevents initial consonants from being masked; smooth release (`300ms`) ensures natural musical swell during speech pauses.

---

## 4. Multitrack Alternate Language Tagging

For multilingual deliverables, multiple discrete audio tracks are muxed into a single MP4 container using ISO 639-2 language tags:

```bash
mgvideo multitrack master.mp4 \
  --tracks '[{"filePath":"audio/en.wav","language":"eng","title":"English Dialogue","isDefault":true},{"filePath":"audio/bg.wav","language":"bul","title":"Български дублаж"}]'
```

- `-metadata:s:a:0 language="eng" -metadata:s:a:0 title="English Dialogue"`
- `-metadata:s:a:1 language="bul" -metadata:s:a:1 title="Български дублаж"`
- Allows QuickTime, VLC, and broadcast television playout systems to present native audio language menus.

---

## 5. Procedural Sound Effect (SFX) Synthesis

To preserve the zero-budget external spend policy (`media_budget_usd = 0.0`), transition cues are synthesized procedurally using mathematical signal generators:

| SFX Name | Synthesis Filter | Frequency / Envelope | Typical Usage |
|---|---|---|---|
| `whoosh` | `anoisesrc` + `bandpass` | White noise swept 300Hz–1200Hz with 0.25s attack / 0.55s decay | Scene card cuts and motion transitions |
| `thud` | `sine` | 55Hz sub-bass tone with 0.05s attack / 0.95s exponential decay | Bold typography / logo impact |
| `pop` | `sine` | 1400Hz pulse with 0.01s attack / 0.07s decay | Toggle switch / button click |
| `chime` | `sine` | 1046.5Hz (C6) tone with 0.1s attack / 1.4s decay | Success state / verified claim badge |

