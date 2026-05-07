# Local Development

Get Claudosseum running on your machine, from `git clone` to a working web app + MCP server + tests + arena harness.

> If anything below is wrong or out of date, the codebase is the source of truth — please update this doc.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node | >= 20 | Pinned in `packages/mcp-server/package.json`. No `.nvmrc` yet — consider adding one. |
| pnpm | recent (8+) | Workspaces are required (`pnpm-workspace.yaml`). |
| A Neon Postgres branch | — | Free tier is fine. Local Postgres also works but the migration runner uses the Neon HTTP driver — see [Local Postgres](#using-local-postgres). |
| A GitHub OAuth App | — | One per environment. See [GitHub OAuth setup](#github-oauth-setup). |
| An Anthropic API key | — | Required for arena LLM calls and `ai-edit`. |

> **Maintainer:** fill in the exact pnpm version you use, and document whether contributors should use a Neon branch or local Postgres.

## 1. Clone + install

```bash
git clone git@github.com:Claudfather/Claudosseum.git
cd Claudosseum
pnpm install
```

## 2. Create `.env.local` at the repo root

`.env.local` lives at the **repo root**, not inside any package. The db package's `migrate` and `seed` scripts use `tsx --env-file=../../.env.local`, and the web package picks it up via Next.js. Both expect the file in the same place.

There is no `.env.example` checked in yet — copy this template:

```bash
# Database (Neon connection string, with ?sslmode=require)
DATABASE_URL=

# GitHub OAuth (see "GitHub OAuth setup" below)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=          # openssl rand -base64 32

# Anthropic — required for arena and /api/skills/[slug]/ai-edit
ANTHROPIC_API_KEY=

# MCP server URL surfaced in the dashboard config snippet
NEXT_PUBLIC_MCP_SERVER_URL=https://claudosseummcp-server-production.up.railway.app/mcp

# Optional toggles
ARENA_ENABLED=            # leave unset (default: enabled). Set to "false" to short-circuit /api/arena/*.
SCRAPER_ENABLED=false     # set to "true" to allow the scrape cron to actually run
GITHUB_TOKEN=             # raises GitHub API rate limits for the scraper
CRON_SECRET=              # required to invoke /api/cron/* outside of Vercel
```

> **Maintainer:** consider committing this as `.env.example` so new contributors don't have to copy it from the docs.

## 3. Database setup

### Option A — Neon (recommended)

1. Create a Neon project and a branch named `dev` (or whatever you like).
2. Copy the connection string into `DATABASE_URL`. Make sure it has `?sslmode=require`.
3. Bootstrap (build, migrate, seed) with one command:
   ```bash
   pnpm db:bootstrap
   ```
   Idempotent — re-running is safe; migrate is a no-op and seed skips existing rows.

### Option B — Using local Postgres

The migration runner uses Drizzle's neon-http driver, which speaks Neon's HTTP API. To use a local Postgres, you'd need to swap to the `node-postgres` driver in `packages/db/src/migrate.ts` (and `client.ts`). This isn't supported out of the box — open an issue if you want it.

## 4. GitHub OAuth setup

Register a GitHub OAuth App for local development:

1. https://github.com/settings/developers → **New OAuth App**
2. **Homepage URL:** `http://localhost:3000`
3. **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
4. Generate a client secret. Put `Client ID` → `GITHUB_CLIENT_ID`, `Client Secret` → `GITHUB_CLIENT_SECRET`.

NextAuth's session is JWT-based; users default to `role = "member"`. To grant yourself admin access:

```sql
UPDATE users SET role = 'admin' WHERE github_login = '<your-handle>';
```

There is no UI for this — it's a deliberate choice (see `documentation/architecture.md` § Admin).

## 5. Run the web app

```bash
# Build the db package once so its dist/ exists for type imports
pnpm --filter @claudosseum/db build

# Start Next.js
pnpm --filter @claudosseum/web dev
```

Open http://localhost:3000, sign in with GitHub. You should land on `/dashboard`.

Useful pages once signed in:
- `/dashboard` — your skills + telemetry summary
- `/workshop/skills/<slug>` — Monaco editor with `ai-edit` (Sonnet)
- `/arena/leaderboard` — empty until you run the harness
- `/admin/*` — if you set your role to `admin`

## 6. Run the MCP server (optional locally)

The MCP server is what Claude Code clients connect to. You don't need it running to develop the web app, but you do need it to test the `claudosseum-sync` skill end-to-end.

```bash
pnpm --filter @claudosseum/db build           # mcp-server imports from @claudosseum/db dist
pnpm --filter @claudosseum/mcp-server dev     # runs tsx src/index.ts on :8080
```

Health check: `curl http://localhost:8080/health` → `{"status":"ok"}`.

To make Claude Code talk to your local server, point your client config at `http://localhost:8080/mcp` and use a Bearer token — generate one at `/dashboard` after signing in (the dashboard creates rows in the `apiTokens` table).

## 7. Run tests

```bash
pnpm test            # Vitest, one-shot
pnpm test:watch      # watch mode
pnpm test:coverage   # with coverage
```

Tests live under `packages/web/src/lib/arena/__tests__/unit/` and `packages/web/src/lib/pipeline/__tests__/unit/`. They cover pure logic (ELO, judgments, votes, costs, URL parsing). DB-dependent code is not covered — that's tracked in `documentation/planning/next-steps.md`.

## 8. Run the arena test harness

End-to-end runner for the arena pipeline (real DB writes, real LLM calls, real spend).

```bash
# Use a separate Neon branch for this — see warning below
pnpm arena-test status                   # health check, no writes, no LLM
pnpm arena-test discover --limit 3       # find 3 skills, categorize, score
pnpm arena-test battle                   # run a single battle
pnpm arena-test full --limit 3           # discover → battle-loop → status
```

> ⚠️ **Cost + destructiveness.** Every `battle` run is ~23 LLM calls (3 scenarios × 5 judges × Haiku + Sonnet skill execs + verdict synth). The harness writes real rows to `intake_candidates`, `battles`, and friends. Use a dedicated Neon branch with `arena-test` in its name — the script will warn if it doesn't see that. **Don't point this at production.**

## Common pitfalls

- **`pnpm migrate` does nothing or errors on missing `DATABASE_URL`** — `.env.local` isn't at the repo root, or doesn't have a value. The migrate script reads `../../.env.local`.
- **Web build fails with type errors from `@claudosseum/db`** — the db package's `dist/` is stale. Rerun `pnpm --filter @claudosseum/db build`. (Tracked in issue #22.)
- **Arena routes return 503 / "Arena disabled"** — `ARENA_ENABLED=false` is set somewhere. The default (unset) is *enabled*; only the literal string `false` short-circuits the routes.
- **`/api/cron/*` returns 401 locally** — `CRON_SECRET` isn't set, or the request is missing `Authorization: Bearer <secret>`. The cron is meant for Vercel; locally you can either set the secret and curl with the header, or just exercise the underlying code (`runScraperJob`, `runQualityControl`) from a script.
- **Sign-in loop / OAuth callback mismatch** — the OAuth App's callback URL must be exactly `http://localhost:3000/api/auth/callback/github`. Trailing slash matters.
- **`ai-edit` returns 500** — `ANTHROPIC_API_KEY` isn't set, or the model name has shifted. Check `packages/web/src/app/api/skills/[slug]/ai-edit/route.ts` for the current model.
- **Drizzle generates an empty migration** — your schema didn't actually change, or you forgot to save. Drizzle diffs against `drizzle/meta/_journal.json`.

## Where to look next

- Per-package READMEs: `packages/db/README.md`, `packages/mcp-server/README.md`, `packages/web/README.md`
- Arena pipeline: `documentation/arena-process-flow.md`
- Non-arena subsystems (intelligence pipeline, cron, admin, ai-edit): `documentation/architecture.md`
- Open work: `documentation/planning/next-steps.md`
- Project mission: `PROJECT_MISSION.md`
