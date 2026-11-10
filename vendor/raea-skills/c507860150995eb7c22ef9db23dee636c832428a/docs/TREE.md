# The raea skill's tree

How the raea skill is laid out, and how we judge whether it covers raea and how deeply. One skill, `skills/raea`;
everything below is a file in it.

## Three axes

- **Domain: what's being made.** Footage and editing, motion graphics and type, sound and music, 3D, games, apps,
  generated media, delivery and publishing, and working with the person in the raea app. Each has a router.
- **Intent: why, and which way.** Modes say what success is for the people a piece is for (pitch, explain, story,
  play, tool); verbs are the moves a note asks for on something that exists (quieter, recut, polish...). Intent crosses
  domain: "make the product shot bolder" is 3D plus `bolder`. These live in `craft/`.
- **Layer: how deep.** The core (SKILL.md: the loop, every step tagged HEADLESS, HOST, PAGE or PERSON) → a domain's
  router (which file to open) → craft (how to do it well) → reference (the exact surface, generated).

## The files

```
SKILL.md                 the core, and the table of routers
footage.md graphics.md sound.md 3d.md games.md apps.md gen.md delivery.md collaborate.md
                         one router per domain, written here
motion.md, motion/       copies of raea's craft guides (sdk/guides/craft/motion)
3d/                      copies of the Bevy guides (sdk/guides/craft/bevy), plus rows.md and plugins.md, written here
craft/                   copies: ROUTER.md, floor.md, rubric.md, modes/, verbs/
reference/               generated from raea's code: cli, feed, files, sdk, app
```

The copies are raea's `tools/skills.sh gen`'s, so a clone of this repo reads whole and says what `raea guide NAME`
prints. Change a guide in raea (`sdk/guides/craft`), run gen, commit the copy here, then bump the pointer in raea;
raea's `tools/skills.sh check` fails on a copy that drifted or one whose guide is gone. The routers, `3d/rows.md`,
`3d/plugins.md` and SKILL.md are written here.

## Coverage

Two questions, kept apart:
- **Surface: is every verb, SDK entry and feed tool taught?** Computed: raea's `tools/skills.sh coverage` lists each
  with whether a guide or this skill (outside `reference/`) names it, and its check warns on each untaught one, so new
  engine surface shows up in L1. What an agent never runs is in its `COVERAGE_SKIP`, each with why.
- **Intent: does each domain meet each mode and each verb?** A matrix, domain by mode and domain by verb, each cell
  present, thin or missing. That's where the real gaps are, and it is judged, not computed.

## Depth

A ladder per domain or topic:

| | means |
|---|---|
| D0 named | the skill says it exists |
| D1 recipe | an agent can do it once, correctly |
| D2 craft | the decisions, the defaults to question, how it fails and what that looks like |
| D3 checked | a check or the floor catches it going wrong |
| D4 evaluated | an eval task shows a fresh agent doing it from the skill alone |

A domain's depth is its weakest common task's. Raise depth where people's work goes first, and add an eval before
calling anything D4.

### Where it stands

Only the topics a change has raised are recorded here. A topic not listed hasn't been rated yet.

| Topic | Depth | What gets it there |
|---|---|---|
| craft/modes (5) | D2 | each mode has its decisions with the default to question, and a table of how it fails: what you see, why, what to change |
| craft/verbs (19) | D2 | each verb has Decide (the choices before changing anything) and When it goes wrong |
| motion/delivery | D2 | why, common mistakes, and an example that renders in three shapes; `raea check --platform` covers the UI zones |
| motion/interface | D2 | why, common mistakes, and an example that `raea app check` passes with steps through every state |
