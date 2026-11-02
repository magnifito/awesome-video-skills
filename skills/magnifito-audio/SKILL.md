---
name: magnifito-audio
description: "Manage narration alignment, sound effects, licensed music mixing, and EBU R128 loudness normalization."
---

# Magnifito Audio Alignment & Loudness Mixing

The `magnifito-audio` skill handles audio tracks, sound effects placement, music ducking, and broadcast loudness compliance.

## Audio Standards & Targets

- **Sample Rate**: 48,000 Hz, 16-bit or 24-bit PCM / 192kbps AAC stereo.
- **Target Integrated Loudness**: `-16.0 LUFS` (standard for web and mobile streaming).
- **True-Peak Ceiling**: `-1.0 dBFS` (prevents inter-sample clipping on mobile DACs).
- **Voice-to-Music Ducking**: Attenuate background music by `-12 dB` to `-15 dB` when speech is present, with 100ms attack and 350ms release.

## Sound Source Modes

Each project brief defines its audio mode:
1. **Supplied Audio**: Client-provided voiceover or music track with verified license.
2. **Cleared Royalty-Free**: Music and sound effects drawn exclusively from internal cleared catalog (`status: "approved"`).
3. **Synthesized Narration**: Authorized TTS services only when budget allows and language phonemes are verified.

## Stopping Conditions

- Fail if measured integrated loudness deviates by more than `±1.0 LUFS` from target.
- Fail if true peak exceeds `-0.5 dBFS`.

