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


## Sound Pass (`mgvideo sfx <video> --cues`)

A measured sound-effects pass for motion graphics. It places one real recorded effect per cue from the vendored CC0 library (Barty-Bart/motion-graphics `skills/sound-effects/sfx/`, read through its `manifest.json`), optionally lays a music bed whose beat grid has been checked, mixes the result to about -16 LUFS with true peak below -4 dBFS, and measures that on the exported MP4. The method is Vox's sound-pass prompt (@Voxyz_ai); upstream code is MIT, Barty-Bart. Claude can't hear, so the pass reports numbers and five timestamps for a person to check with headphones. Never tell the user it sounds good.

### Setup

```
mgvideo setup sfx            # pinned venv: librosa, soundfile, numpy, scipy (+ numba)
mgvideo doctor               # shows "Sound Pass (librosa venv)"
```

The venv is created in `${XDG_CACHE_HOME:-~/.cache}/mgvideo/venvs/sfx` and never in the repo. It needs Python 3.10 to 3.13, which is the range the pinned wheels support. Pass `--python <bin>` to choose the interpreter and `--force` to rebuild. Running setup again does nothing if the venv is already set up. Only the `--music` path needs the venv; without music, levels are measured with ffmpeg. If the venv is missing when `--music` is given, the command fails and tells the user to run `mgvideo setup sfx`.

### Cue format

`cues.json` is an array, or `{ "cues": [...] }`:

```json
[
  { "t": 0.5, "type": "scene_cut", "desc": "cut to title" },
  { "t": 1.2, "type": "appear" },
  { "t": 2.0, "type": "typing", "dur": 1.2 },
  { "t": 3.5, "type": "build_up", "dur": 1.0 },
  { "t": 4.5, "type": "reveal" },
  { "t": 5.3, "category": "ding", "snap": true }
]
```

- `t`: seconds on the video timeline. It must fall before the end of the video.
- `type`: what the cue is for. The manifest `category_map` turns it into a library category: movement/scene_cut→whoosh (starts 2 frames early, -4 dB), appear/success→pop, click→click, typing→typing (looped and trimmed to `dur`, -8 dB), build_up→riser (trimmed so it **ends** at `t + dur`), reveal→impact (the loudest), error_or_tech→glitch, hover_or_small_ui→tick, bed→ambience.
- `category`: pick a library category directly instead of a type (e.g. `ding`, `transition`, `ui-blip`).
- `snap: true`: if music is given and the cue is within `--snap-window` (default 0.12 s) of a beat, the effect moves onto the beat. Hard cuts (`scene_cut`, `reveal`) are not moved. The music start is shifted instead, so the cuts land on beats, and the report gives the error for each cut in ms.

Validation is strict. An unknown type or category, a time past the end, or a bad `dur` stops the command, and the error lists every problem.

### Run

```
mgvideo sfx in.mp4 --cues cues.json --out out/ \
  [--music track.mp3 --music-db -12 --music-source "Track, Artist, link" --music-license "..."] \
  [--use-case "YouTube"] [--seed 7] [--swaps swaps.json] [--no-proof]
```

Outputs in `out/`: `after.mp4` (video stream copied, AAC audio), `mix_raw.wav`, `CREDITS.txt`, `report.json`, `report.html` (play every cue, choose alternatives, download `swaps.json` and re-run with `--swaps`), and `checks/cue-XX-{before,after,wave}.png`.

The first cue in a category uses the manifest `default_kit` sound. Later cues in that category pick other takes with a seeded RNG, so the same `--seed` gives the same picks, and the same file never plays twice in a row. If the input video already has audio, it is kept at 0 dB under the effects. There is no voiceover ducking.

### Licence rules

- Only **CC0** files bundled in the vendored library are placed. Manifest entries that point at runtime URLs (Mixkit, including the upstream default typing sound) are rejected and never downloaded, cached or shipped. `report.json` lists every rejected entry. A swap that is a URL is refused.
- Never add Mixkit, Pixabay or other non-redistributable audio to the repo.
- Music is the user's track. Pass `--music-source` and `--music-license`. Without them, `CREDITS.txt` and the report say **LICENCE NOT CONFIRMED**, and you must tell the user so. Pass `--use-case` so known conflicts are flagged, for example Mixkit music used for broadcast.
- `CREDITS.txt` is a ready-to-paste list of the sounds actually used plus the music. CC0 does not require credit, but the list proves where the audio came from.

Report to the user: the licence summary, the music source and licence (or that they are not confirmed), whether the beat grid was shifted and by how much, the error for each cut, the final LUFS and true peak (stereo and mono), and the five timestamps.
