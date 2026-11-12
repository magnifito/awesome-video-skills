# Modes

The workflow (`brief.json` `workflow`) says which tools build the piece. The mode says what
success looks like for the people it is for. Pick the mode from what is being made and where it
runs, not from the product: an app's ad is pitch, the same app's walkthrough is explain.

| Mode | It works when the viewer... | Usual skill | Guide |
|---|---|---|---|
| pitch | stops, believes one thing, and acts | `magnifito-promo` | [`../../magnifito-promo/reference/pitch-mode.md`](../../magnifito-promo/reference/pitch-mode.md) |
| explain | can do or explain one thing afterwards | `magnifito-product-demo` | [`../../magnifito-product-demo/reference/explain-mode.md`](../../magnifito-product-demo/reference/explain-mode.md) |
| story | feels something and wants to see more | `magnifito-edit` with `magnifito-audio` | below |

Modes mix: a trailer can be story then pitch. Read each guide; where two disagree, the mode the
piece leads with wins. Write the mode in the first scene's `factual_purpose` so later passes
know it.

## Story mode

Brand films, trailers, music-led edits. It works when the viewer feels something specific by the
end and could say in one sentence what the piece was about.

### Rules

| Rule | What it means |
|---|---|
| Name the feeling | One or two words before any shot is planned: homesick, giddy, dread. "Epic" and "beautiful" describe a look, not a feeling. |
| One world | Decide what each colour means, where the light comes from, the lens and how the camera moves. Every shot belongs to that world. |
| A subject in every shot | Close or medium on a person, an object or an action. A wide shot earns its place once, to show where we are, and still has something in it. |
| Camera keeps moving through cuts | A shot starts already moving and ends still moving, so the cut joins motion to motion. Easing to a stop before each cut reads as a slideshow. |
| Cut on the music's energy | Build the beat grid first ([`../../magnifito-audio/reference/beat-and-sound-sync.md`](../../magnifito-audio/reference/beat-and-sound-sync.md)). Hold through quiet sections (a cut every 2 or 4 bars), cut on the bar in the middle, on the beat or half bar where energy is high, faster through a build, and put the biggest change on the drop. Never a cut on every bar line. |
| Sparse narration | Fewer lines with room around them. A line that repeats the picture goes. |
| A poster frame | Choose the one image the piece is remembered by before rendering, and build the edit toward it. |
| Planned | Scene plan plus a camera note per shot (subject, framing, move, how the cut joins the next: matched motion, a planned reversal, or a hard cut on a hit). Approved before the full render. |

### How it fails

| Symptom | Why | Fix |
|---|---|---|
| A montage nobody remembers | The shots have no subject | Put a person, object or action in every shot |
| It plays like a slideshow | Each camera eases to a stop before the cut | Start and end each shot while the camera still moves (recut) |
| The cutting feels mechanical | Every cut lands on the bar line | Cut on the song's events: downbeats, builds, stops, the drop |
| Shots look like different films | Light, colour or lens drifts from the world | Regrade to the world's rules (regrade) |
| The narration explains the picture | A line repeats what is on screen | Cut the line, or give it what the picture cannot show |
| The ending fizzles | Nothing was built toward | End on the poster frame or the line the piece was made for |

### Check

- The arc builds, breathes and lands; it does not stay at one level.
- Cover the title: every shot is clearly from this piece.
- The ending lands on the poster frame or the line the piece was built for.

Notes from the person map to named moves: [`moves.md`](moves.md).

Sources: Adapted from raea-skills (shinyobjectz/raea-skills, Apache-2.0)
`skills/raea/craft/ROUTER.md`, `skills/raea/craft/modes/story.md` and `skills/raea/motion/timing.md`,
method credited to Impeccable (pbakaus/impeccable, Apache-2.0).
