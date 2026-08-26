# Agent Instructions

## Package Manager

- Use **npm**: `npm ci`, `npm run dev`, `npm test`.
- Keep exact dependency versions and commit `package-lock.json`.

## Required Context

- Read `PROJECT_PLAN.md` and `PROGRESS.md` before changing code.
- Work against one task ID and update its file in `docs/progress/`.
- Run `npm run progress:build` before a branch-final commit.

## File-Scoped Commands

| Task                | Command                                       |
| ------------------- | --------------------------------------------- |
| Lint                | `npm exec eslint -- path/to/file.ts`          |
| Test                | `npm exec vitest -- run path/to/file.test.ts` |
| Workspace typecheck | `npm run typecheck`                           |

## Key Conventions

- External payloads are `unknown` until validated with Zod.
- Domain models do not import venue clients.
- `packages/options-engine` stays pure: no DOM, React, network, or chart imports.
- UI code talks to charts only through `ChartAdapter`.
- Do not silently change formulas, source meaning, or calculation versions.
- Never substitute missing market data with zero or label stale data as live.
- Keep source files focused; review files over 400 lines.
- No paid dependencies, exchange credentials, or secrets in logs.

## Completion Gate

- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and relevant Playwright tests.
- Record files, tests, results, issues, and architecture decisions in the task journal.

## Commit Attribution

AI commits MUST include:

```
Co-Authored-By: Codex <noreply@openai.com>
```
