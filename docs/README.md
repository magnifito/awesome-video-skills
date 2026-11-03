# Documentation

Documents are grouped by **authority** — how much weight a reader should give them — not by topic.
Topic is the second level, inside each tier.

**Agents: read [`index.json`](index.json) first and filter by `kind` and `status`. Never grep this
tree blind.** [`INDEX.md`](INDEX.md) holds the same data for humans. Both are generated — run
`npm run gen:docs-index` after adding, moving or restatusing a document; never hand-edit them.

## Current state

Every document in this tree is `status: reference`. They were written alongside the code and
describe intended behaviour; a 2026-11-03 code review found many claims that the code did not
meet (stub engines, self-approving review records, undocumented or missing commands). Treat
them as background, **not** as a specification. Each one is promoted out of `reference/` only
after its claims are checked against the code.

## The tiers

| Tier | `kind` | What it is |
|---|---|---|
| `reference/` | `reference` | Captured or unverified documentation. **Not a commitment, never a build spec.** Promote first (below). |
| `product/` | `product` | Committed scope. |
| `engineering/` | `engineering` | How this repository works. Current and authoritative. `engineering/adr/` holds ADRs, `engineering/runbooks/` holds runbooks. |
| `plans/` | `plan` | Work in flight. `plans/done/` is where a plan goes when it genuinely closes. |
| `archive/` | `archive` | Replaced. Everything here is `status: superseded` and names its replacement. |

`kind` is derived from the path and also stored in frontmatter; the gate rejects a document where
the two disagree. Move files between tiers with `npx docs-notary mv <from> <to>`, which restamps
`kind`, `status` and `updated` and records `promoted_from`.

## Frontmatter

Every `.md` under `docs/` carries a YAML block. The only exemptions are this file and the
generated `INDEX.md`.

```yaml
---
title: CLI Reference                   # required
summary: Every mgvideo subcommand      # optional, one line — shown in the index
kind: reference                        # required — must equal what the path implies
status: reference                      # required — reference | draft | active | shipped | superseded
updated: 2026-11-03                    # required — ISO date, bumped on a substantive edit
---
```

Write new documents with `npx docs-notary new <path> --title "…" --summary "…"`; it passes the gate
on the first run. `status: reference` is legal only under `reference/`, and everything under
`reference/` must carry it.

## The promotion lifecycle

```
reference/   →   engineering/ or product/   →   plans/   →   plans/done/
(unverified)     (checked against code)         (active)      (shipped)
```

1. `npx docs-notary mv docs/reference/<doc>.md docs/engineering/<doc>.md`.
2. **Rewrite every claim to match the code as it is.** Delete claims the code does not meet.
   Promoting a document verbatim turns its old assumptions into requirements.
3. Add `code:` pointing at the implementation.

## The gate

`npm run lint:docs` is a blocking CI step. It checks frontmatter, kind versus path, status versus
tier, kebab-case paths, duplicate basenames, index freshness, and dead Markdown links (inside
`docs/` and from tracked files outside it). `npm run lint:docs:advisory` reports drift without
failing. `npm run docs:impact` lists documents whose claims cover changed paths.
