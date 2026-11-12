# Mix levels, ducking and fades

Starting numbers for balancing sources against each other. The master loudness and true peak are
not here: they are in
[`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md)
(-16 LUFS default) and `mgvideo validate` measures them. Set levels from measurements, then
listen; Claude reports numbers and a person listens.

## Measure each source first

```bash
ffmpeg -hide_banner -nostats -i voice.wav -af ebur128 -f null - 2>&1 | grep -A1 "Integrated loudness"
```

Set every gain against the narration's integrated loudness, not by ear on one pass. A flat gain on
every clip is how one shot shouts over the narrator and the next one is inaudible.

## Levels

| Source | With voice | Without voice (promo, end card) |
|---|---|---|
| Voice | Reference (0 dB) | none |
| Music bed | 15 to 20 LU under the voice; lift it back once the voice stops (end card) | `--music-db` default -12 in the sound pass |
| The film's own sound (where narration stops) | About 3 LU under the voice; its loudest 3 s no more than 2 LU over it | as cut |
| Effects (hits, pops, whooshes) | Clearly under the voice; never on top of a word | The reveal loudest, the rest under it |

- **Never boost a near-silent take by more than 3 dB.** Its hiss and room come up with it. Use a
  different take, or let it sit low.

## Ducking

| Setting | Value |
|---|---|
| Reduction under speech | 10 to 14 dB |
| Attack | 40 ms |
| Release | 300 to 400 ms |

- The SDK's `sidechain(voice, music, options)` (`packages/media/src/sidechain.ts`) uses ffmpeg
  `sidechaincompress`. Its defaults are a 20 ms attack and 350 ms release: pass `attackMs: 40`. Its
  reduction depends on `threshold` and `ratio`, so measure the bed under a voiced line rather than
  trusting the settings.
- The `mgvideo sfx` pass does not duck under voice; duck the bed before it, or keep the bed low.
- Under a sparse drone score a gentler duck reads better: 6 to 8 dB, slower release.
- If the bed pumps as it ducks, lengthen the release or lower the whole bed.

## Fades

| Where | Fade |
|---|---|
| End of a music bed | 1 to 1.4 s fade-out, ending on or before the last frame |
| Any audio cut (dialogue, effect, bed edit) | 12 ms fade on each side, so the cut does not click |
| A bed shorter than its span | Tile copies end to end with 1.5 s crossfades; a hard loop is a jump |

```bash
# 1.2 s fade at the end of a 30 s bed, 12 ms fade-in at its start
ffmpeg -i bed.wav -af "afade=t=in:d=0.012,afade=t=out:st=28.8:d=1.2" bed-faded.wav
```

A bed that stops without a fade is a P1 `dead-stop` in `validate`. Clicks left at edits:
`mgvideo declick <audio>`.

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/motion/sound.md` and `skills/raea/motion/music.md`, method credited to Impeccable
(pbakaus/impeccable, Apache-2.0).
