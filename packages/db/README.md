# @claudosseum/db

Database layer for Claudosseum. Drizzle ORM schema, migration runner, seed script, and shared helpers (`auth`, `publish`) used by the MCP server and the web app.

## Stack

- PostgreSQL on [Neon](https://neon.tech) (serverless)
- Drizzle ORM + drizzle-kit for migrations
- Neon HTTP driver (`@neondatabase/serverless`) — see [Gotchas](#gotchas)

## Layout

```
src/
  schema.ts    Single source of truth for all 23 tables
  client.ts    createDb(databaseUrl) → Drizzle client
  auth.ts      validateToken() — Bearer-token lookup used by mcp-server
  publish.ts   publishNewVersion() / promoteVersion() — atomic via db.batch
  migrate.ts   Migration runner (neon-http driver)
  seed.ts     Two-phase seed: skills (from global/skills/) + categories
drizzle/      Generated SQL migrations + meta/ (journal, snapshots)
```

## Schema overview

All 23 tables live in `src/schema.ts`. Grouped by domain:

| Domain | Tables |
|--------|--------|
| Auth | `users`, `apiTokens` |
| Skills registry | `skillCategories`, `skills`, `skillVersions`, `userSkillPins`, `userInstalledVersions` |
| Telemetry | `skillInvocations`, `skillFeedback`, `activityEvents` |
| Intelligence | `sourceConfigs`, `sourceSnapshots`, `learnings`, `learningSkillLinks` |
| Arena | `intakeCandidates`, `battles`, `battleScenarios`, `battleRounds`, `battleJudgments`, `arenaRankings`, `arenaLlmCalls`, `arenaEloHistory`, `arenaPipelineEvents` |

For arena flow, see [`documentation/arena-process-flow.md`](../../documentation/arena-process-flow.md).

## Scripts

| Script | What it does |
|--------|--------------|
| `pnpm build` | `tsc` — compiles to `dist/` |
| `pnpm generate` | `drizzle-kit generate` — produces a new SQL migration from schema diff |
| `pnpm migrate` | Applies pending migrations against `DATABASE_URL` (loads `.env.local` from repo root) |
| `pnpm seed` | Seeds skills from `global/skills/` + categories (loads `.env.local`) |
| `pnpm studio` | `drizzle-kit studio` — interactive table browser |

## Workflow

**First-time bootstrap** (fresh DB):

```bash
pnpm db:bootstrap   # build → migrate → seed; idempotent
```

**After changing the schema:**

```bash
pnpm --filter @claudosseum/db generate   # write a new migration
pnpm --filter @claudosseum/db migrate    # apply it
pnpm --filter @claudosseum/db build      # rebuild dist so consumers see the new types
```

**Always add CHECK constraints to `schema.ts`** for any text column with an enum, using `check("chk_<table>_<col>", sql\`${table.col} IN (...)\`)` in the table options. The TypeScript `enum: [...]` hint gives type safety at compile time; the CHECK constraint enforces it at runtime in the DB. Drift between the two has caused real bugs (e.g., `verdict_synthesis` was missing from a migration constraint, would have rejected valid writes).

Downstream packages import like:

```ts
import { createDb } from "@claudosseum/db/client";
import { skills, battles } from "@claudosseum/db/schema";

const db = createDb(process.env.DATABASE_URL!);
```

Subpath exports: `./client`, `./schema`, `./auth`, `./publish` (see `package.json`).

## Migrations

Single baseline migration as of `0000_initial.sql`. Captures the entire schema generated from `src/schema.ts`, including all 20 CHECK constraints. Sequenced via `drizzle/meta/_journal.json`. The Neon HTTP driver does not support interactive transactions, so multi-statement atomicity uses `db.batch()` at the application layer instead.

The previous twelve `0001_phase05`–`0012_arena_quality_signal` migrations were collapsed during the Claudosseum rename: phases 01–04 were never captured as SQL (they were applied via `drizzle-kit push`), so the chain couldn't run on a fresh DB. The collapsed baseline makes `pnpm db:bootstrap` work end-to-end on any clean Neon branch.

When adding a migration that depends on data state, prefer separate migrations for schema and backfill so a partial failure leaves the DB in a recoverable state.

## Gotchas

- **`.env.local` lives at the repo root**, not in this package. `pnpm migrate` and `pnpm seed` use `tsx --env-file=../../.env.local`. If the file is missing they fail with no `DATABASE_URL`.
- **Neon HTTP driver has no interactive transactions.** Use `db.batch([...])` for atomicity (see `publish.ts` for the pattern).
- **Stale `dist/` after schema changes** breaks consumers. Always `pnpm --filter @claudosseum/db build` after `generate`. Open issue: #22.
- **Seed taxonomy is hardcoded** — the `SKILL_TAXONOMY` map in `seed.ts` lists each skill's (domain, function). Add a new skill there before seeding it.
- **`userInstalledVersions` has no write path today** — the schema exists for a future feature; admin UI reads it but nothing writes to it.
