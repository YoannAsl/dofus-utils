# 1. No comments in code

Status: accepted (2026-11-20)

## Context

Comments drifted from the code they described, repeated what names and types already said, and sometimes justified a hack instead of fixing it. A comment written to excuse an odd implementation gets copied along with it.

## Decision

Source files carry no comments. Each kind of comment has a better home:

- Says what the code does: rename, extract a function or tighten a type until the code says it.
- Explains an important, non-obvious decision: write it in an ADR in `docs/adr/`.
- Explains away a hack: delete it and open a GitHub issue to fix the hack.
- Out of date: delete it.

Tool directives stay allowed: `@ts-expect-error`, `eslint-disable`, `/// <reference>`, `# type: ignore`, `# noqa`, shebangs.

`node scripts/comments.mjs check` enforces this with a ratchet. `comments-baseline.json` records how many comments each file may still hold. A file over its count fails. A file under its count also fails until `node scripts/comments.mjs tighten` lowers the baseline, so deleted comments cannot come back. CI runs the check on every push and pull request. The `/delete-comment` skill (`.claude/skills/delete-comment`) repeats the clean-up.

Generated and vendored code is exempt: `front/src/routeTree.gen.ts` and the shadcn components in `front/src/components/ui/`.

## Consequences

- Reasons live in ADRs, which a reader has to know to open. ADR titles name the subsystem they cover so they can be found.
- Hacks get an issue instead of an apology in the code.
