# Motion timing for scene plans

Rules distilled from `motion-design-principles` (LottieFiles, MIT) and the taste numbers in
`claude-motion-motion-design` (whaleyxbt, MIT), vendored at
`vendor/vxi-motion-tools/2fae287134109449676d9afbfd38318985d75121/skills/`. Rewritten for this
toolkit. Numbers marked "recipe code" come from `packages/motion/src/recipes/`, not upstream.

## What a storyboard author actually controls

The scene plan has no per-element timing field. You set three things:

1. `duration_seconds` and `duration_frames` per scene. Renders run at 30 fps, so
   `duration_frames = round(duration_seconds × 30)`.
2. Scene order.
3. How much copy each scene carries (`copy_text` words, `|` rows).

Easing, stagger and overshoot are fixed inside each recipe (`mgvideo recipe <id>` prints them).
The HyperFrames adapter animates each card's entrance: elements fade and rise in order,
timed by the brand `motion_preferences.tempo` (`calm` is slowest, `punchy` adds overshoot), and
the whole entrance ends within 45% of the scene. Cinematic, product-reveal and speaker-card
recipes also drift the camera unless `camera_style` is `static`. Other recipe `motion` values
are drawn at rest. Use the element tables below to pick recipes,
to judge a render and to argue for a recipe change. Do not try to express them in the plan.

## Element durations (video scale)

Upstream tables are for app UI at arm's length. For a film watched on a phone or across a room,
take the top of each range.

| Element | UI range | Use in video |
|---|---|---|
| Small label, chip, badge | 80–200 ms | 0.2 s |
| Card or panel entering | 200–350 ms | 0.35–0.5 s |
| Large focus change (modal-sized) | 300–400 ms | 0.4–0.6 s |
| Full-frame change | 400–600 ms | 0.5–0.7 s |
| Dramatic reveal | 600–1200 ms | 0.8–1.25 s |
| Ambient drift, loop | 2–20 s | whole scene |

- **Distance scales time.** 50 px = 0.8×, 100 px = 1.0×, 200 px = 1.3×, 400 px = 1.6×,
  full frame = 1.8–2.0×.
- **Exits are shorter.** An exit takes 50–75% of its entrance (0.35–0.55 s against 0.7–1.25 s).
- **Easing direction.** Arrivals decelerate, exits accelerate, moves between two states ease
  both ends. Linear only for continuous motion (rotation, drift, counters ticking).
  Reference curves: arrive `(0.16, 1, 0.3, 1)`, leave `(0.6, 0, 0.9, 0.35)`,
  move `(0.65, 0, 0.35, 1)`.

## Stagger

| Pattern | Delay per item | Total |
|---|---|---|
| Words in a phrase | ~0.09 s | up to ~1 s |
| List rows, chips | 0.12–0.25 s | 0.6–1.0 s for 6 items |
| Dots, rings, grid cells | 0.02–0.06 s | < 0.3 s |

Upstream's "total stagger under 500 ms" is a UI rule; a six-item list on video can take up to
1 s. Staggered items share one easing and differ only in start time. What our recipes use
(recipe code): `kinetic-typography` 60 ms per word, `motion-card-morph` 0.12 s per row,
`motion-bars-chart` up to 0.16 s per bar (shrinks on short scenes, never below 0.05 s).

## Overshoot budget

| Context | Overshoot |
|---|---|
| Premium, calm, financial, healthcare | 0% |
| Errors, warnings, rejected states | 0% |
| Feedback, corporate | 2–5% |
| Success, positive result | 5–10% |
| Celebration, one hero beat | 15–25% |

`kinetic-typography` lands at 1.05 (5%). Pick recipes whose overshoot fits the brand's
`motion_preferences.tempo`; a `calm` brand should not get a celebration bounce.

## Choreography rules

- **Hero first.** The main element enters first or with the biggest move.
- **One direction.** Everything in a scene enters from the same side or the same origin.
- **One third of the elements.** With three or more moving items, at most a third move at once.
- **One third of the frame.** No single move crosses more than a third of the frame without a
  change of direction or speed.
- **Counter-motion.** Background moves against the hero at 20–30% of its speed. Depth layers:
  foreground 1.0×, midground 0.5×, background 0.2×.
- **Phase split.** Setup 20–30%, action 30–40%, resolution 30–40% of the scene. Leave
  0.1–0.2 s of stillness after a sequence settles, before the next move.
- **One focal point per frame, one hero moment per film.** Build to it; do not spend it in the
  first scene.
- **Scenes overlap, never gap.** A blank pause between scenes reads as loading. The motion
  engine hides cuts behind its centred dot, so plan its scenes back to back.

## Reading time

Every readable state needs a hold after it settles:

- **Hold** = 1.0 s + 0.25 s for every word beyond three.
- **Final line or call to action** holds at least 2 s.
- **Typing effects** cost about 0.035 s per character before the hold starts.
- Text does not move while it is meant to be read. When in doubt, hold longer and cut words.

## Setting `duration_seconds` per recipe

Always stay inside the recipe's `recommended_duration_seconds` (`mgvideo recipe <id>`). If the
reading time does not fit, cut words or split the scene; never shorten the hold.

| Recipe | How to size it |
|---|---|
| HyperFrames recipes | The card settles by 45% of the scene at the latest, so the hold is the remaining 55%: duration × 0.55 ≥ hold for all words on the card. |
| `motion-kinetic-type` | Words land from 0.42 s at one step each (0.1–0.42 s); the last word holds ~0.9 s, then the exit runs at T−0.34 s (none on the last scene). Use T ≈ 1.7 + 0.28 × (words − 1). At 6 s that fits ~16 words; above that the step falls below 0.2 s, so split. |
| `motion-card-morph` | Rows are readable from the card landing (~0.24 T) until the control appears (~0.6 T): a window of about 0.36 T − 0.4 s. At 7 s that is ~2.1 s, so keep headline plus rows near 10 words. |
| `motion-bars-chart` | Bars land by about 0.22 T + 0.36 s + 0.16 s per bar, then hold to T−0.34 s. Use T ≈ 2.8 + 0.5 × bars. |
| `motion-logo-reveal` | Tagline words start at 0.95 s, up to 0.08 s apart. As the last scene it needs a 2 s hold: T ≈ 3 + 0.08 × words. |

Recipe windows are derived from the recipe code; confirm them by watching the render
(manual check).

## Scene order and time budget

- **Frame 0 is never empty or black.** Muted autoplay shows it as the thumbnail. Check with
  `mgvideo thumbnail <target> -t 0` (manual check of the image).
- **Lead with the problem, end with the answer.** Hook, proof, call to action, logo last.
- **The lead message gets 35–40% of the runtime.** Viewers notice proportions; if one part
  dominates, add time to the others rather than cutting the part that works.
- **Vary scene lengths.** Every scene at the same duration feels mechanical; contrast a fast
  scene with a held one.
- **Sum check.** Scene durations must add up to `brief.duration_seconds`. The contract helper
  `checkPlanAgainstBrief` allows 0.5 s, but no `mgvideo` command runs it today: manual check.
  Compute absolute boundaries first, convert each to frames, then take differences, so rounding
  does not accumulate.

## Smell table for reviews

| Looks like | Usually because | Fix in the plan |
|---|---|---|
| Text flashes past | Hold below the reading rule | Longer scene or fewer words |
| Mechanical, flat | Same duration everywhere | Vary durations, keep one held beat |
| Busy, tiring | Too many items per scene | Split the scene, one focal point each |
| Ending feels cut off | Final hold under 2 s | Lengthen the last scene |
