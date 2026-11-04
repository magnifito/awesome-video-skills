# Beat grid and sound sync

Rules distilled from motion-designer (kaventro), claude-motion (whaleyxbt) and the
voice-subtitle-sync skill of video-production-skills (Video Production Skills contributors), all
MIT, vendored at `vendor/vxi-motion-tools/2fae287134109449676d9afbfd38318985d75121/skills/`.
Rewritten for mgvideo; no upstream code is run or imported. Commands below exist in
`packages/cli/src/bin/mgvideo.ts`; anything else is plain ffmpeg/ffprobe.

## 1. One timeline

Picture, sound cues, captions and chapters all read their times from one place.
- In a project that place is `scene-plan.json`. `cues.json` for `mgvideo sfx` is written from it,
  and `mgvideo chapters <project>` derives chapters from it.
- Every cue `t` is a scene event or an offset from one (`cut + 0.05`). Never a number typed by eye.
- When timing changes (a hold, a new line of voice), regenerate cues, captions and chapters together.
  A hit between beat lines usually means a hardcoded time or a stale file.

## 2. Beat grid

- Beat length = `60 / BPM` s. Bar length = beats per bar x beat (4/4 unless the track says otherwise).
- Beat `n` sits at `bar1 + (n - 1) x 60 / BPM`, where `bar1` is the time of the first downbeat.
- Sanity checks before trusting a grid:
  - The tempo is what you would tap. Double or half tempo is a detector error; say so.
  - Drops and breakdowns fall 4, 8 or 16 bars apart. If a section starts one beat off a bar line,
    move `bar1` by one beat.
  - The stretch you will use has a steady tempo (no slow-down, no tempo change).
- What `mgvideo sfx <video> --cues cues.json --music track --out dir` does with the grid (needs
  `mgvideo setup sfx`):
  - librosa estimates tempo and beats, then compares kick peaks below 120 Hz with them. If the
    median kick offset is over 30 ms, the whole grid is shifted onto the kicks. The log says
    `grid OK` or `SHIFTED whole grid`.
  - It slides the music start (5 ms steps, at most 8 beats, and only as far as the track is
    longer than the video) to put `scene_cut` and `reveal` cues as close to beats as possible,
    and writes each cut's remaining error to `report.json`.
  - Cues with `"snap": true` within `--snap-window` (default 0.12 s) move onto the nearest beat.
    Hard cuts are never moved; the music moves instead.
  - It does not cut music to bars and does not re-time the picture. That is section 3.

## 3. Plan picture to music, cut music on whole bars

- Something moves on a beat; scenes change on bar lines; the biggest reveal lands on a downbeat,
  ideally the track's drop. Put the drop in the plan first and plan backwards from it.
- One visual change per beat. Secondary motion may sit between beats; main actions may not.
- Holds are whole beats, so everything after a hold stays on the grid. Need more time? Add holds.
  Never change the music's speed.
- Pick the start bar: `A = drop_bar - (reveal_beat - 1) / beats_per_bar`. Start and end on phrase
  boundaries so the edit (and a loop) joins two phrase edges.
- Cut the edit: start `bar1 + (A - 1) x bar`, length `bars x bar`, rounded to a whole number of
  video frames. Short edge fades stop clicks:
  ```bash
  # 25 bars at 120 BPM = 50.000 s, starting at bar 4 with bar1 = 0.512 s -> start 6.512 s
  ffmpeg -i track.wav -ss 6.512 -t 50.000 \
    -af "afade=t=in:d=0.006,afade=t=out:st=49.988:d=0.012" -ar 48000 edit.wav
  ```
- Rules: cut only on bar lines; no time-stretch, re-pitch, section loops or mid-bar splices.
- If `edit.wav` is exactly as long as the video, the sound pass cannot slide it, so the bar cut you
  chose is kept. Give it a longer track only when you want the pass to pick the offset.
- **Verify:** `ffprobe -v error -show_entries format=duration -of csv=p=0 edit.wav` equals the
  video duration; the sound-pass log reports the expected tempo; each cut's error in `report.json`
  stays within one video frame (33 ms at 30 fps, 17 ms at 60 fps). A cut further off moves in
  `scene-plan.json`, not in the music.

## 4. Sound cues

The cue types and their library mapping are in `../SKILL.md` (Sound Pass). How to use them:
- Accent, do not narrate. One sound per action that matters, starting on the frame it moves.
  Drift, grain and slow rotation stay silent.
- One `reveal` (impact) per video, on the hero moment. At most one `build_up` riser, with `dur`
  set so it ends exactly on that hit.
- `typing` takes `dur` equal to the typing on screen. `scene_cut`/`movement` whooshes already start
  2 frames early; do not offset them again.
- Level order: the reveal loudest, supporting cues clearly under it, the music as a bed
  (`--music-db`, default -12). Under speech the bed ducks 12 to 15 dB (see `../SKILL.md`).
- Same `--seed` gives the same takes. Swap a take through `report.html` and `--swaps swaps.json`,
  not by editing files.
- Only the bundled CC0 effects and music the user has cleared. Pass `--music-source` and
  `--music-license`; without them the credits say the licence is not confirmed, and you must say so.

## 5. Sync checks

- **Off-beat hits:** read the per-cut errors in `report.json` and the `checks/cue-XX-wave.png`
  proofs. Each transient should sit on its beat or a hair after it.
- **Sudden jumps:** momentary loudness per 400 ms window:
  ```bash
  ffmpeg -v error -i dir/after.mp4 -af "ebur128=metadata=1,ametadata=print:key=lavfi.r128.M:file=momentary.txt" -f null -
  ```
  A rise or drop of more than about 6 LU between neighbouring readings that is not a planned hit
  is a level jump to fix. Clicks at edits: `mgvideo declick <audio>`.
- **Holes in the bed:** `ffmpeg -v info -i dir/after.mp4 -af "silencedetect=n=-50dB:d=0.5" -f null - 2>&1 | grep silence_`
- **Overview:** `mgvideo waveform dir/after.mp4 -o wave.png`. It has no beat lines; compare its
  peaks with the cue times.
- **Loudness:** the pass aims for -16 LUFS within 0.5 LU and true peak below -4 dBFS on the MP4,
  and reports a mono downmix. On the final master run `mgvideo inspect final.mp4`: fail beyond
  1 LU from -16 or with true peak above -0.5 dBFS; aim for -1 dBTP.
- **Listening:** the pass lists five risky timestamps. A person checks them on headphones. Claude
  reports numbers only and never says it sounds good.

## 6. Voice and caption sync

- **Time from measured audio, never from the script.** Measure the voice file
  (`ffprobe -v error -show_entries format=duration -of csv=p=0 voice.wav`) and build caption times
  from its real timestamps. Script estimates are not final timing.
- **Lines:** one idea per line, about 4 to 12 words. A line starts on, or a beat or half beat after,
  the action it describes, never before it, and ends before the next action. Speech fills well under
  two thirds of the runtime; the music stays audible between lines.
- **SRT rules:** UTF-8, numbered cues, start >= 0, end > start, last end within the measured
  duration, no overlaps (unless two speakers), each cue at least 0.65 s, at most 20 characters
  per second. Split by meaning, not by length alone.
- **[cmd]** `mgvideo broll words captions.srt -o words.json --txt words.txt` rejects malformed
  timestamps and spreads each cue's span over its words by character count (about 0.2 s accuracy).
  It has no speech recognition: word times are only as good as the cues.
- **[cmd]** Review copy with burned captions (needs ffmpeg with libass):
  `ffmpeg -i final.mp4 -vf "subtitles=captions.srt" -c:a copy review-captions.mp4`, then sheet it
  as in `skills/magnifito-deliver/reference/render-qa.md`.
- **[manual]** Listen for names, numbers, units, dates, negations and qualifiers; check them against
  `claims.json`. Transcripts and waveforms do not replace listening.
- After any edit to speech or pauses, recompute the affected captions, cues and chapters. Do not
  hide bad timing by speeding the voice up (upstream allows at most 1.2x to make a line fit).
- Keep soft subtitles (SRT) in the delivery even when a burned-in version exists.
