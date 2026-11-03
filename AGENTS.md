# Agent Instructions

## Documentation

- Read `docs/index.json` first and filter by `kind` and `status`. Never grep `docs/` blind.
- Every document under `docs/reference/` is `status: reference`: background only, not a
  specification. Do not implement anything from it without checking the code first.
- Promote a document with `npx docs-notary mv <from> <to>`, then rewrite every claim to match
  the code. Never promote verbatim.
- Write new documents with `npx docs-notary new <path> --title "…" --summary "…"`. Documents
  produced by other tools (specs, plans) get sorted into a tier before commit (docs-sort).
- `npm run lint:docs` must pass. Run `npm run gen:docs-index` after adding, moving or
  restatusing a document.
