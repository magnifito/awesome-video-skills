# raea-skills

The official skills library for [raea](https://raea.io), the Render Anything
Engine — agent skills for video editing and media work.

Skills teach an agent **how to use raea well** without deciding **what the
result should look like**. raea's variety is the point; see
[docs/RULES.md](docs/RULES.md).

## Quick start

```bash
just doctor   # are the tools installed?
just setup    # build the checker
just ci       # run every check
```

## Needs

| Tool | Why | Install |
|---|---|---|
| raea | the engine | `curl -fsSL https://raea.io/install \| sh` |
| Rust (cargo) | the checker + Gherkin tests | `curl https://sh.rustup.rs -sSf \| sh` |
| just | runs the recipes | `brew install just` |
| uv | runs montology (vocabulary) | `brew install uv` |
| gh | GitHub | `brew install gh` |

## Everyday recipes

| Command | Does |
|---|---|
| `just new cut-by-words` | start a skill from the template |
| `just check` | lint skills: format, raea drift, opinion creep |
| `just test` | run the Gherkin behaviour specs |
| `just link` | install this repo's skills into Claude Code, live |
| `just drift` | after a raea update: re-snapshot, list stale skills |
| `just word cut` | check a term with montology before using it |

## Layout

```
skills/         one folder per skill (SKILL.md)
features/       behaviour specs in Gherkin (Given / When / Then)
crates/         skillcheck — the Rust checker and test runner
upstream/raea/  snapshot of the raea these skills are checked against
docs/           RULES · SOP · HOW-SKILLS-WORK · TREE (how the raea skill is laid out, covered and deepened)
```

## Contributing

Follow [docs/SOP.md](docs/SOP.md). New to skills? Start with
[docs/HOW-SKILLS-WORK.md](docs/HOW-SKILLS-WORK.md).
