# Lower thirds

Distilled from the `lower-thirds` skill by iart.ai (MIT), vendored at
`vendor/vxi-motion-tools/2fae287134109449676d9afbfd38318985d75121/skills/lower-thirds/`.
Rules are restated for `mgvideo lower-third`; nothing from the vendored scripts is used.

## What our command does

```bash
mgvideo lower-third talk.mp4 -n "Maya Chen" -t "Head of Research" \
  -s 2.0 -d 5 -c "#3B82F6" -b "#0F172A" --bottom 120 -o out/talk-lt.mp4
```

It **burns** a badge into a new H.264 MP4 (CRF 20, audio copied). Facts from the code
(`packages/media/src/lower_third.ts`):

- The badge is a fixed **680 × 120 px** rounded panel at **x = 80 px**, `--bottom` px above the
  bottom edge (default 120). It does not scale with the video resolution.
- Name: white, bold, 28 px. Role: the `-c/--color` accent, 600 weight, 18 px. A thin accent bar
  runs down the left edge. `-b/--bg` fills the panel at 95% opacity fading to 75%.
- Font is the rasterizer's `sans-serif` (rsvg-convert, resvg, ImageMagick or Chrome, whichever
  is found first), so the face depends on the machine.
- It cuts on at `-s` and off at `-s + -d`: no build-in or build-out motion.
- There is no alpha output and no X-position flag. Long names are not shrunk to fit.

So: use it for quick finished cuts. When the editor needs a separate transparent strap, the
toolkit cannot make one yet; say so instead of improvising.

## Title-safe placement per aspect ratio

Keep every pixel of the strap at least **5% in from each edge** (title-safe). On vertical
platforms the bottom ~20% is covered by app UI (see `SKILL.md`), so the strap must sit above it.
Badge numbers below are for our fixed 680 × 120 badge.

| Frame | Left edge (x = 80) | Suggested `--bottom` | Notes |
|---|---|---|---|
| 1920 × 1080 (16:9) | 4.2%, inside action-safe, outside title-safe | 120 (default, 11%) | Fine for web; flag it for broadcast |
| 1280 × 720 (16:9) | 6.3% | 80-120 | Badge is 53% of the width: large |
| 1080 × 1080 (1:1) | 7.4% | 140-160 | Clear of feed captions and UI |
| 1080 × 1920 (9:16) | 7.4% | 400 or more | Bottom 20% = 384 px is app UI; right edge at 70% clears the side buttons |
| 3840 × 2160 (4K) | 2.1%, outside title-safe | n/a | Badge is 18% wide and text 28 px: too small, render at 1080p or skip |

With burned-in captions, measure their top and set `--bottom` so the badge sits above them:

```bash
# A still at a moment with captions, to read where they start
ffmpeg -v error -ss 10 -i talk.mp4 -frames:v 1 still-10s.png
```

Keep the strap clear of B-roll panels too. A `"bottom"` panel area in `magnifito-broll` and a
lower third at the same time will collide.

## Type size and legibility

- Upstream guidance: name about **50-80 px tall at 1080p**, role about half that, and the strap
  covering only a few percent of the frame. Our 28/18 px is small for 1080p TV viewing and
  acceptable on phones; at 4K it is too small. Manual check: look at a full-frame still.
- Text must sit on its own backing. Our panel does that; keep `-b` dark (name is always white)
  and pick `-c` so the role line contrasts with `-b`. Manual check on a still over the
  brightest shot in the clip.
- Check the longest name and role you will use. There is no fit-to-box: at 28 px bold, a name
  over roughly 40 characters runs past the 680 px panel. Manual check: look at the still.
- Keep the user's spelling and punctuation exactly. Never invent a surname or a title.
- Bulgarian/Cyrillic names: the machine's `sans-serif` must have Cyrillic glyphs, or letters
  come out as boxes. Manual check on the still.

## Timing

- Upstream defaults: build-in under 1 s, a still hold of 5-6 s, build-out about 0.5 s, empty
  first and last frames. Our command has only the hold: `-d 5` to `-d 6` is the right range.
- Bring it in once the speaker is on camera and talking, not on the first frame. Use the word
  list from `mgvideo broll words` to pick the start of their first sentence, plus about 0.5 s.
- Show it once per person per segment, and never during a full-frame B-roll cutaway.
- The hold must not move. (Ours is static by construction.)

Check the cut points by hand:

```bash
# Expect the badge at the middle, and no badge just outside the window (here -s 2 -d 5)
for t in 1.9 4.5 7.1; do ffmpeg -v error -ss $t -i out/talk-lt.mp4 -frames:v 1 lt-$t.png; done
```

## Font-loaded check

Our badge has no font loading step: the rasterizer picks a font for `sans-serif`. Manual check:

```bash
# Which font fontconfig gives rsvg-convert / resvg / ImageMagick for sans-serif
fc-match sans-serif
```

Then look at the still: a missing weight shows up as a non-bold name, a missing script as boxes.

## Alpha deliverables (made outside the toolkit)

When a strap arrives as a transparent file (from a designer or another tool), verify the alpha
before passing it on. Our CLI does not do this for lower thirds.

```bash
# ProRes 4444: expect pix_fmt=yuva444p10le (a "yuva" format)
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt \
  -of default=nw=1 strap.mov
# VP9 WebM: the alpha lives in a side stream flagged alpha_mode=1
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name:stream_tags=alpha_mode \
  -of default=nw=1 strap.webm
# Decode a frame from the hold (force libvpx-vp9 for WebM or the alpha is dropped) and look at
# the alpha plane: mostly black (see-through), the strap white
ffmpeg -v error -c:v libvpx-vp9 -ss 3 -i strap.webm -vf alphaextract -frames:v 1 strap-alpha.png
```

Also check that the first and last frames are fully empty, so the clip never pops on or off.

## NLE and switcher notes

| Tool | Use | Notes |
|---|---|---|
| Premiere Pro | ProRes 4444 `.mov` | Premiere ignores WebM alpha: the clear area turns black |
| DaVinci Resolve | `.mov` | Dark edges or a halo: set the clip's alpha mode to Straight |
| Final Cut Pro | `.mov` | Connected clip above the footage |
| OBS | VP9 `.webm` | Media Source, loop off, restart when the source becomes active, keep it at 0,0 unscaled |
| Chrome / Edge page | `.webm` | Safari needs HEVC with alpha (macOS-only encode, below) |
| Editor without alpha | Our burned-in MP4 | Or a strap on flat green for chroma key; thin text may fringe |

```bash
# Safari copy of a VP9-alpha strap, on macOS only (VideoToolbox HEVC with alpha)
ffmpeg -c:v libvpx-vp9 -i strap.webm -c:v hevc_videotoolbox -alpha_quality 0.75 \
  -tag:v hvc1 -b:v 2M strap-safari.mov
# ProRes 4444 from an existing VP9-alpha WebM (decode with libvpx so alpha survives)
ffmpeg -c:v libvpx-vp9 -i strap.webm -c:v prores_ks -profile:v 4444 \
  -pix_fmt yuva444p10le strap.mov
```

## Not covered

No broadcast-legal colour check, no interlace handling, no live CG (CasparCG, OGraf) link.
