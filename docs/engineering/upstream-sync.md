---
title: Upstream sync
summary: "Nightly upstream detection, one upstream-update issue per source, and the label-gated agent that turns an issue into a pull request"
kind: engineering
status: draft
updated: 2026-11-04
---

# Upstream sync

How new commits in the 13 tracked upstreams reach this repository: a nightly job opens one issue
per upstream, and a maintainer decides whether an agent turns that issue into a pull request.

## Nightly detection

`.github/workflows/upstream-check.yml` runs at 03:00 UTC and on `workflow_dispatch`. After
`tools/upstreams/lock.ts` and `tools/upstreams/remote_check.ts`, it runs
`tools/upstreams/sync_issues.ts`, which for every entry in `registry/upstreams.json`:

1. Takes the base commit: `approved_commit` from `registry/approved.lock.json`, or
   `observed_commit` when the source has no approved baseline.
2. Reads the HEAD of `tracking_branch` and the compare range base...HEAD from the GitHub REST
   API (commits, changed files with status and +/- counts). Nothing is cloned and no upstream
   code runs.
3. Flags license or notice files, new, removed and modified `SKILL.md` files, Mixkit paths,
   audio files, agent instruction files and dependency or CI files (`sync_report.ts`, reusing
   `diff_classifier.ts`).
4. Keeps one open issue labelled `upstream-update` per upstream, found by the body marker
   `<!-- upstream:<id> -->`. A second marker records the last reported HEAD.
   - No open issue and HEAD differs from base: create it.
   - HEAD moved since the last report: rewrite the body and comment with only the new commits.
   - HEAD equals the base again (for example after the adoption PR merged): comment and close.

Upstream text (commit messages, author names, paths) only appears inside fenced `text` blocks,
marked untrusted, with backticks, angle brackets, control characters, `@mentions` and `#123`
references neutralised and every field length-capped. Bodies stay under 60 000 characters.

The workflow needs `issues: write`; it creates the `upstream-update` and `agent-go` labels if
they are missing. Run it locally without writing anything:

```bash
GITHUB_TOKEN=$(gh auth token) npx tsx tools/upstreams/sync_issues.ts --dry-run [--only <id>]
```

Manual runs from the Actions tab take a `dry_run` input that passes the same flag.

## The human gate and the agent

`.github/workflows/upstream-agent.yml` runs only when the `agent-go` label is added to an open
`upstream-update` issue by a person with write or admin access (checked through the
collaborator permission API). It has three jobs:

1. **gate** resolves the upstream with `tools/upstreams/agent_context.ts`. Only the id marker is
   read from the issue body; owner, repo and base come from the registry and HEAD is looked up
   again.
2. **agent** downloads the upstream tarball at HEAD into the runner temp directory as data
   (Mixkit paths excluded, symlinks deleted, execute bits removed) and runs
   `anthropics/claude-code-action` with a read-only `GITHUB_TOKEN`. Its tool list allows file
   edits, `npm test`, `npm run lint:docs`, docs-notary, `lock.ts`, `sha256sum` and read-only git;
   `git push`, `git commit`, `gh`, `curl`, web fetch and web search are denied. The workflow
   commits the result, rejects changes under `.github/`, `.claude/`, `CLAUDE.md` or any Mixkit
   path, and uploads the commit as a patch.
3. **publish** has no agent in it. It applies the patch to a new `upstream-sync/<id>-<head>-<run>`
   branch, pushes it, opens a pull request that references the issue, comments the link on the
   issue and removes `agent-go` so the label can be applied again.

The agent never pushes and nothing is pushed to `main`. The pull request is reviewed and merged by
a person.

## Owner setup

- Repository secret, exactly one of: `ANTHROPIC_API_KEY` (Console API key) or
  `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, uses a Claude subscription).
- Settings → Actions → General → Workflow permissions: enable "Allow GitHub Actions to create
  and approve pull requests", or the publish job cannot open the PR.
- Labels `upstream-update` and `agent-go` are created by the first nightly run; create them by hand
  to use the gate earlier.
- Protect `main` (require a pull request) so no token can push there.
- Pull requests opened with `GITHUB_TOKEN` do not trigger other workflows. Run the evaluation
  workflow on the PR by closing and reopening it, or push a commit to the branch.
