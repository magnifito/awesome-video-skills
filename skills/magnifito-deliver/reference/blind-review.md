# Blind review loop

A second opinion from a reviewer who has not seen how the piece was made. It sees the frames and
what a viewer would know, never the scene plan, code or the builder's notes, so it judges the
picture and not the intent. Measured rules (`mgvideo validate`, [`floor.md`](floor.md)) come first.
The blind review covers what measurement cannot: whether the point lands.

## Steps

1. Render, then run `mgvideo validate`. Fix every P0 and P1 before you review.
2. `mgvideo review prepare <run> -p <project>` writes the following to `<run>/review/`:
   - `sheet-NN.png`: 24 tiles per sheet, one every 0.5 s, each numbered with its time.
   - `tiles.json`: the time of each tile.
   - `brief.md`: objective, audience, language, length, mode and axes.

   The mode comes from the workflow: product demo and explainer are `explain`, talking head is
   `story`, everything else is `pitch`. Override it with `--mode`.
3. Start a fresh subagent with the prompt below. Give it only the sheet images and `brief.md`. Do
   not give it the project folder, the conversation, or your own opinion of the piece.
4. Save its JSON as `<run>/review/round-NN.json`, numbered from 01.
5. Run `mgvideo review judge <run>`. Code decides the result:

   | Result | When | Exit |
   |---|---|---|
   | Pass | No P0 or P1 defect, lowest score at least 6, mean at least 7, in two rounds in a row | 0 |
   | Continue | Not passed yet and no stop rule has fired | 1 |
   | Stop | 8 rounds; or the mean gained under 1 point in each of the last two rounds; or the same defect (same tile and wording) in three rounds in a row | 3 |

6. On continue, change **one** thing: the worst defect, using the move in
   [`moves.md`](moves.md). Render again, prepare the sheets again, and start a **new** subagent for
   the next round. Put the change in the round's `changed` field. Changing several things at once
   hides which change helped.
7. On stop, hand the piece to a person, with the rounds and what changed in each.

## Reviewer prompt

```
You review a short video from frame sheets only. You did not make it and you have no other context.
Files: brief.md (what a viewer would know) and sheet-*.png (tiles numbered top-left with time, 0.5 s apart).
1. blind_read: before scoring, say in one or two sentences what this is and who it is for.
2. scores: rate every axis in brief.md from 0 to 10 (6 = acceptable, 8 = strong, 10 = nothing to change):
   open   - in the first 2 s something makes this audience stop and raises a question
   point  - after one watch the audience could say what to believe, in one plain sentence
   shown  - what the words claim is on screen, working, at that moment
   loop   - one project followed through one loop, each step leading to the next
   pull   - each scene ends on something unresolved
   land   - the end gives a next step, a payoff or a return to the opening
   pace   - shot lengths follow what they hold; nothing sits still longer than it earns
   read   - every word that matters is large, sharp against its background and on long enough
   world  - colour, type and motion hold one direction from first frame to last
   own    - with the name covered, this could only be this brand
3. defects: every problem as {tile, where, wrong, fix, level}. level: P0 the piece fails (wrong fact, the point
   does not come through), P1 this audience would stop watching or believing here, P2 it costs attention,
   P3 finishing. Name the tile where it is worst.
Answer with JSON only: {"round": N, "mode": "<from brief>", "blind_read": "...", "scores": {...}, "defects": [...]}
Sound is not on the sheets: do not judge it.
```

## Advisory until calibrated

`mgvideo validate` reports the latest round's defects as `judge` items and the result as
`judge-decision`. Until the judge has been compared with a person on at least 10 rounds with 80 %
agreement, both are advisory:
- `judge` items are capped at P2 and marked `[advisory]`.
- `judge-decision` is a P3 note.
- Neither one blocks `mgvideo package`.

Once calibrated, defects keep their level and a failed decision is P1.

To calibrate, have a person look at the same sheets (or the video) after a judged round and record
whether they would pass it:

```
mgvideo review record <run> --person pass|fail --note "why"
mgvideo review calibration
```

Verdicts go into `evaluations/judge-calibration.json` in the toolkit, so commit that file with the
reason in the note.

Sources: rubric questions and ranking adapted from raea-skills (shinyobjectz/raea-skills,
Apache-2.0) `skills/raea/craft/rubric.md`; the judge loop from `skills/raea/3d/prompts.md`.
