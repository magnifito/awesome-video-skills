# The delivery floor

The floor lists what breaks a video, with one number per rule. A rule belongs here only if two good
editors would not argue about it; taste (pacing, palette, which move to use) lives in the craft
guides, not here. Other references point to this file instead of repeating the numbers.

The numbers follow the raea skills floor (`vendor/raea-skills/c507860150995eb7c22ef9db23dee636c832428a/skills/raea/craft/floor.md`,
Apache-2.0), with the changes decided in `docs/plans/raea-adoption.md` (Phase 1). `mgvideo validate`
measures every rule marked [validate]; the rule id is what `validate.json` overrides use.

## Picture

| Rule | Floor | Severity | Rule id |
|---|---|---|---|
| Text inside the frame | No settled text more than 1 px past the frame edge | P0 | `text-clipped` [validate] |
| Text out of the UI zones | See the table below | P1 | `text-safe-zone` [validate] |
| Text size | 9:16: 60 px at 1080 wide (scale with width). Other aspects: frame height / 60 (18 px at 1080) | P1 for scene copy, P2 for labels | `text-size` [validate] |
| Contrast | 3:1 against the pixels behind the text; body text (under 24 px at 1080, 18.66 px bold) 4.5:1 | P1 below 3:1, P2 body below 4.5:1 | `text-contrast` [validate] |
| Reading time | Unnarrated copy readable for max(0.3 s per word, 1 s) | P2 | `text-reading-time` [validate] |
| Overlap | Two texts at least 30 % opaque overlap by no more than 20 % of the smaller one | P2 | `text-overlap` [validate] |
| Still picture | Nothing stands still for 3 s unless the stillness is the point | P2 from 3 s, P1 from 6 s or half the video | `freeze` [validate] |
| Black | No black span of 0.5 s or more | P2 | `black` [validate] |
| Flashing | No more than 3 flashes in any second over a large part of the frame (WCAG 2.3.1) | P1 | `flash` [validate] |

"Settled" means the text has finished its entrance (at least 95 % of its full opacity). Text that
slides in from outside the frame is fine; text that rests outside it is not. Text size is the font
size the renderer was given, in output pixels. "Scene copy" is text taken from the scene's
`copy_text`; anything else (badges, recipe tags, decoration) is a label.

### UI zones

Margins where text must not go, in pixels on a frame whose short side is 1080; scale by short side
/ 1080. In 9:16 the platform comes from `"platform"` in `<project>/validate.json` (default
`generic`, which clears all three apps).

| Frame | Top | Bottom | Left | Right |
|---|---|---|---|---|
| 9:16 generic | 220 | 420 | 60 | 140 |
| 9:16 TikTok | 108 | 320 | 60 | 120 |
| 9:16 Reels | 210 | 310 | 60 | 84 |
| 9:16 Shorts | 120 | 300 | 60 | 96 |
| 4:5 | 110 | 170 | 60 | 60 |
| 1:1 | 70 | 120 | 60 | 60 |
| 16:9 | 120 | 120 | 60 | 60 |

These are for organic posts. Paid placements cover far more of the frame: the platforms' ad
templates (checked 2026-11-11) clear about 240 px at the top and 660 px at the bottom on TikTok,
and 35 % of the height at the bottom on Reels and Shorts. For an ad, place text from the
platform's current ad template, not from this table. The table lives in
`packages/contracts/src/index.ts` (`VERTICAL_SAFE_ZONES`, `SAFE_ZONES`); `mgvideo safezone` draws the
same margins.

Only the HyperFrames and html engines record text (`text-manifest.json` in the run). Runs from other
engines get a P3 note, and their text is checked by hand against this table.

## Sound

| Rule | Floor | Severity | Rule id |
|---|---|---|---|
| Loudness | -16 LUFS integrated, within 1 LU (or the request's `target_loudness_lufs`; a platform target goes in `validate.json`) | P1 | `loudness` [validate] |
| True peak | At or below -1 dBTP | P1 | `true-peak` [validate] |
| Dead stop | No steady bed that cuts out without a fade | P1 | `dead-stop` [validate] |
| Silence | A delivery with sound has sound | P2 | `audio-silent` [validate] |

## Not measured yet

- Face cover: text over more than 8 % of a face box (needs face detection).
- Cues on words and names on screen when the voice says them (needs word times; plan Phase 6).
- Red flashes.

## Changing a rule for one project

A project that breaks a rule on purpose says so in `<project>/validate.json`:

```json
{ "platform": "reels", "rules": { "text-size": { "severity": "P2", "reason": "legal line, sized by the client" } } }
```

The reason is printed next to the check in every report. Never lower a rule to make a render pass
without a reason a reviewer would accept.
