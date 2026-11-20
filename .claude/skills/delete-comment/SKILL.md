---
name: delete-comment
description: Find the code comments left in this repo, sort each into tautology, stale, excuse or decision record, then delete them, file issues for the hacks they excused, move decisions into ADRs, and tighten the comment ratchet. Use for /delete-comment, or when `node scripts/comments.mjs check` fails.
---

# Delete comments

This repo bans code comments (`docs/adr/0001-no-code-comments.md`). `scripts/comments.mjs` finds them in TS/TSX/JS, CSS, HTML, Python (docstrings included), PowerShell and TOML, and skips tool directives (`@ts-expect-error`, `# noqa`, shebangs…) and generated code (`routeTree.gen.ts`, `components/ui/`). `comments-baseline.json` is the ratchet: how many comments each file may still hold.

Arguments, if any, narrow the run to those paths. Otherwise, take every comment.

## 1. List

```sh
node scripts/comments.mjs list    # one JSON object per comment: path, startLine, endLine, text, ownLines
node scripts/comments.mjs lines   # totals, and how many whole lines deleting them all removes
```

Read each comment with the code around it. Don't classify from the comment text alone.

## 2. Classify

Put each comment in exactly one bucket:

- **Tautology**: the name, signature or type already says it ("Ajoute un arc et renvoie son indice." above `addEdge(): number`). Section banners count as tautology too.
- **Stale**: describes code, behaviour or history that no longer holds. Check with grep: a renamed field, a tuple that is now an object, "the original app", a package docstring narrower than the package.
- **Excuse**: explains away code that should change: magic numbers named only in a comment, a positional tuple whose order lives in a comment, `null`/`""` sentinels with a meaning only the comment gives, state used as an event channel, compatibility shims for things that can't happen any more.
- **Decision record**: a non-obvious reason the code is the way it is, which someone could break by "simplifying": an external quirk (OCR misreads, DofusDB formats, Win32 rules), a formula and why it differs from another tool's, a compatibility promise for stored data, a performance trade-off with its numbers.

When unsure between tautology and decision record, ask: would a competent reader who deletes this comment then plausibly break something? If yes, it's a decision record.

## 3. Act

- **Decision record**: add it to the ADR in `docs/adr/` that covers its subsystem, or write the next numbered ADR (`NNNN-kebab-title.md`: title, Status, Context, Decision, Consequences). Write the reason in plain English, with the concrete numbers and names. Do this before deleting, so nothing is lost.
- **Excuse**: open one issue per hack (group comments that excuse the same hack):
  `gh issue create --label enhancement --title "<the fix, imperative>" --body "<where, what the comment excused, the fix>"`.
  Mention that the comment was removed under ADR 1.
- **Tautology / stale**: nothing to keep.

Then delete them all in one pass:

```sh
node scripts/comments.mjs delete path/to/file.ts:12 other/file.py:40   # by start line, as `list` printed it
node scripts/comments.mjs delete --all                                 # every comment
```

`delete` removes whole comment lines, strips trailing comments, and collapses the blank lines it leaves. Delete by the line numbers from a fresh `list`, before editing those files by hand.

## 4. Verify and ratchet

```sh
node scripts/comments.mjs tighten   # lowers comments-baseline.json to the new counts
node scripts/comments.mjs check
cd front && npm run typecheck && npm test
cd server && PYTHONPATH=src python -m unittest discover -s tests
```

A Python function or class whose only statement was its docstring becomes a syntax error: give it a body (`...`) or remove it. Commit `comments-baseline.json` with the deletions.

## 5. Report

Give the counts per bucket, the ADRs written or extended, the issue links, and the lines removed (`git diff --shortstat`).
