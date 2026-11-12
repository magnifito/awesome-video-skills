# Explain mode

Walkthroughs, tutorials, feature demos. The piece works when the viewer could repeat one loop
themselves afterwards: open it, do the thing, see the result. Delivery numbers are in
[`../../magnifito-deliver/reference/floor.md`](../../magnifito-deliver/reference/floor.md).

## Rules

| Rule | What it means |
|---|---|
| One project through one loop | Pick a real project and follow it from the first step to the result. Each scene moves that project forward. A tour of features is the opposite. |
| Plan first | Write who it is for and the one thing they can do afterwards (`brief.json` `audience`, `objective`). Then a scene plan with one row per scene: on screen, narration, payoff. The person approves it before the full render. |
| 25 to 45 words per scene | One step per scene. More words means two scenes. |
| Say only what is on screen | Every name the voice says is visible and readable as it is said; every thing the viewer has to find gets named. |
| Timed from the transcript | Camera moves and cursor arrive from the measured word times (`mgvideo transcribe`), never by eye. The camera reaches the next control just before it is used. |
| A real cursor | It moves to the control, clicks, and the screen answers. No drawn outlines, boxes or spotlights standing in for it. |
| Real screens, framed | Real product, real size, cropped until the text that matters reads at the size it ships (the 120 to 150 % zoom in `../SKILL.md`). Never draw a fake screen. |
| Honest time | Cut waits and loading; show results at real speed. Never show a speed the product does not have. |
| A payoff | The last scene shows what the loop made, held at least 1.5 s. |

## Decisions to question

- **The loop.** Choose the task a newcomer does most often, not the most impressive feature: a
  viewer cannot repeat that on day one.
- **The project.** Real names, ideally the person's own data. An empty demo workspace teaches
  nothing. Placeholder data is synthetic and marked in `assets.json`.
- **Voice or burned-in words.** Voice for a walkthrough people choose to watch; burned-in
  captions when it plays muted in a feed. Often both.

## The rut

Feature lists read aloud. A cursor wandering over a full-size recording. Device mock-ups
floating on a gradient. Narration that describes what the viewer already sees instead of why it
matters.

## How it fails

| Symptom | Why | Fix |
|---|---|---|
| Viewers lose the thread halfway | A scene relies on a later step, or one scene holds two steps | Reorder, or split the scene in two (recut) |
| The voice names something nobody can find | The name is not on screen when said, or too small to read | Zoom to it as it is said, or change the line (clarify) |
| It plays like a feature tour | Scenes do not move one project forward | Rebuild around one loop and one project |
| The cursor arrives after the voice | Cues were timed by eye | Time camera and cursor from the transcript |
| It ends on a logo | The payoff is missing | End on the finished thing the loop made |

## Check

- Hold each step until its result lands, then move on.
- Narration: calm and quick. Faster usually reads better, as long as every word stays clear.
- Watch it as a newcomer. Where do they lose the thread?

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/modes/explain.md`, method credited to Impeccable (pbakaus/impeccable, Apache-2.0).
