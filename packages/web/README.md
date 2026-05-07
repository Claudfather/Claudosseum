# @claudiator/web

Next.js 15 (App Router) app deployed on Vercel. Hosts the dashboard, the arena, the workshop, the admin panel, the telemetry views, the cron endpoints, and all REST APIs the platform exposes outside MCP.

## Stack

- Next.js 15 + React 19 (App Router, server components)
- NextAuth v5 (beta) — GitHub OAuth, Drizzle adapter
- `@anthropic-ai/sdk` for arena LLM calls
- `@claudiator/db` (workspace) — transpiled in `next.config.ts`

## Page routes

```
/                          Landing → redirects to /dashboard once signed in
/dashboard                 User skills, pins, telemetry summary
/dashboard/generate        Skill generation UI
/workshop/skills/[slug]    Skill authoring (Monaco editor, AI edit, draft/publish)
/workshop/learnings        Learnings inbox
/workshop/feedback         Skill feedback inbox
/admin/*                   Activity, feedback, skills, team, versions
/arena/                    Overview
/arena/intake              Candidate queue
/arena/leaderboard         Rankings (canonical; /arena/rankings redirects here)
/arena/battles             Battle index
/arena/[battleId]          Battle detail
/arena/categories          Category list
/arena/categories/[slug]   Category detail (rubric editor)
```

## API routes (`src/app/api/`)

| Group | Notable routes |
|-------|----------------|
| `auth/[...nextauth]` | NextAuth handler |
| `whoami` | Current session info |
| `tokens/*` | API token CRUD + rotate |
| `skills/[slug]/*` | Read, draft, publish, `ai-edit` (Anthropic-backed inline edit) |
| `arena/intake/*` | Submit, categorize, score candidates |
| `arena/battles/*` | Create, execute, cancel, fetch |
| `arena/categories/*` | CRUD + rubric editing (admin POST) |
| `arena/discover` | Trigger discovery from configured sources |
| `arena/evolve`, `arena/rankings` | Evolution + leaderboard data |
| `learnings/[id]/*` | Status, apply |
| `telemetry/{overview,stats/[slug]}` | Read-only metrics |
| `admin/*` | Feedback status, version nudges |
| `cron/scrape` | Daily 6am: source scrape + intake (`vercel.json`) |
| `cron/maintenance` | Weekly Sun 4am: cleanup + ranking refresh |

Cron requests are authenticated via `CRON_SECRET`.

## Arena code

Pure logic lives under `src/lib/arena/`; UI under `src/app/arena/`. The lib files are unit-testable and have most of the test coverage in this package.

```
src/lib/arena/
  matchmaker.ts          DEFAULT_BATTLE_CONFIG (3 scenarios × 1 round × 5 judges)
  scenarios.ts           Haiku scenario generator
  executor.ts            executeBattle() — orchestrates exec + judging + verdict
  judges.ts, prompts.ts  Judge configs + prompt builders
  category-council.ts    5-Haiku council, majority threshold 3
  intake.ts              Candidate intake + fight scoring
  rankings.ts            ELO (K=32), title assignment
  evolution.ts           Close-loss detection, evolved-skill generation
  costs.ts, llm.ts       Cost tracking + Anthropic SDK wrapper
  pipeline-events.ts     emitPipelineEvent() helper
  battle-queries.ts, types.ts, extract-challenger-name.ts
```

For pipeline lifecycle (DB statuses vs pipeline events), see [`documentation/arena-process-flow.md`](../../documentation/arena-process-flow.md).

## Auth

`src/lib/auth.ts` — NextAuth v5 with the GitHub provider and the Drizzle adapter. JWT sessions carry `userId` and `role`. New users default to `member`; the `admin` role is set manually in the database. Admin-only API routes check `session.user.role === "admin"`.

## Test harness

`scripts/arena-test.ts` is the end-to-end harness for the arena. Modes:

| Mode | What it does |
|------|--------------|
| `pnpm arena-test discover [--repo X] [--limit N]` | Fetch + categorize + score skills from sources |
| `pnpm arena-test status` | Print arena health (configs, queue, leaderboard, LLM cost) |
| `pnpm arena-test battle` | Find next match and run a single battle end-to-end |
| `pnpm arena-test full` | discover → status → battle-loop → status |

It loads `.env.local` from the repo root and warns loudly if `DATABASE_URL` doesn't look like a test branch.

## Tests

Vitest. Files live under `src/lib/arena/__tests__/unit/` and `src/lib/pipeline/__tests__/unit/`. Run from repo root:

```bash
pnpm test            # one-shot
pnpm test:watch      # watch mode
pnpm test:coverage   # with coverage
```

## Local dev

```bash
# 1. Make sure the db package is built and migrated (see packages/db/README.md)
# 2. Start the dev server
pnpm --filter @claudiator/web dev    # http://localhost:3000
```

Required env (in `.env.local` at the repo root):

| Var | Why |
|-----|-----|
| `DATABASE_URL` | Neon connection string |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth app |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | NextAuth |
| `ANTHROPIC_API_KEY` | Arena LLM calls + `ai-edit` |
| `NEXT_PUBLIC_MCP_SERVER_URL` | Surfaced in the dashboard config snippet |

Optional: `ARENA_ENABLED=false` (kill switch — every arena route returns early), `SCRAPER_ENABLED`, `GITHUB_TOKEN` (raises scraper rate limits), `CRON_SECRET` (required if hitting `/api/cron/*` outside Vercel).

## Gotchas

- **Stale `@claudiator/db` dist** — `next.config.ts` sets `transpilePackages: ["@claudiator/db"]`, but it still consumes compiled types. Rebuild db after schema changes (open issue: #22).
- **Arena kill switch is checked in 15+ route handlers.** A return-early pattern, not middleware. Adding a new arena route? Add the check.
- **`arena-test` against prod is destructive.** The harness creates real LLM calls and writes battles. The DB-name check is a guardrail, not a guarantee — use a dedicated Neon branch.
- **Admin role is database-only.** No UI to grant it; `UPDATE users SET role = 'admin' WHERE …` is the path.
- **Cron without `CRON_SECRET` returns 401.** Vercel injects it for scheduled runs; add it to `.env.local` to invoke locally.
