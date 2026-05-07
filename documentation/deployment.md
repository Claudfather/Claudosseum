# Deployment

Production runs on three providers:

| Provider | What lives there | Build / deploy config |
|----------|-------------------|------------------------|
| **Neon** | PostgreSQL database (schema + data) | `packages/db/drizzle/` migrations applied via `pnpm --filter @claudosseum/db migrate` |
| **Vercel** | Next.js web app (`@claudosseum/web`) — dashboard, arena UI, all REST APIs, cron jobs | Auto-deploy on push; cron schedules in `packages/web/vercel.json` |
| **Railway** | MCP server (`@claudosseum/mcp-server`) at `https://claudosseummcp-server-production.up.railway.app/mcp` | `/railway.toml` |

For env-var meanings see [`architecture.md`](./architecture.md) and the per-package READMEs. This doc covers only what's deployment-specific.

## Env-var matrix

Each provider needs only the variables its workload actually reads.

| Variable | Neon | Vercel | Railway |
|----------|:----:|:------:|:-------:|
| `DATABASE_URL` | source | ✓ | ✓ |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | | ✓ | |
| `NEXTAUTH_URL`, `NEXTAUTH_SECRET` | | ✓ | |
| `ANTHROPIC_API_KEY` | | ✓ | |
| `NEXT_PUBLIC_MCP_SERVER_URL` | | ✓ | |
| `ARENA_ENABLED` (optional, defaults enabled) | | ✓ | |
| `SCRAPER_ENABLED` (optional, defaults disabled) | | ✓ | |
| `CRON_SECRET` (auto-injected by Vercel for cron, set explicitly to invoke locally) | | ✓ | |
| `GITHUB_TOKEN` (raises GitHub API rate limits for the scraper) | | ✓ | |
| `PORT` (optional; defaults to 8080) | | | ✓ |

The MCP server reads `DATABASE_URL` and `PORT` only — every other env var is unused by it.

## Neon branch model

> **Maintainer:** describe the branch topology here. What's the production branch called? Is there a long-lived `staging` or `dev` branch? Do you use Neon's Vercel integration for ephemeral branches per PR? Which branches do contributors point their local `.env.local` at?

A complete answer should let a new engineer know:

- Which connection string is the production one (and where it lives — Vercel env, Railway env, somewhere else)
- Whether they should ever run migrations against the prod branch directly, or always through a promotion flow
- The naming convention for non-prod branches (so they don't accidentally connect to prod)
- Whether Neon's Vercel integration auto-creates a branch per Vercel preview deployment

## Migration deployment workflow

> **Maintainer:** describe how migrations reach production. This is the highest-risk operation in the system and currently lives only in tribal knowledge.

Things to nail down:

- **Who runs `pnpm --filter @claudosseum/db migrate` against the production `DATABASE_URL`?** A maintainer from their laptop? CI on merge to `main`? A separate manual step?
- **When?** Before or after the Vercel deploy that depends on the new schema? (Drizzle migrations are forward-only by convention — a Vercel deploy that lands first against an old schema can fail traffic.)
- **What's the gating control?** PR review of `packages/db/drizzle/` is currently the only checkpoint.
- **Do you ever run a migration against prod from a feature branch?** (Most teams say no — but worth stating explicitly.)
- **Who has access to the production `DATABASE_URL`?** (Auditable answer.)

A worked example for a typical change would be valuable — e.g., "when adding a new column to `skills`, the sequence is: open PR → review schema diff → merge → run `pnpm --filter @claudosseum/db migrate` against prod → verify with a quick Drizzle Studio look → confirm Vercel picked up the deploy."

## Secrets rotation

> **Maintainer:** document the rotation playbook for each secret. Most are mechanical, but `NEXTAUTH_SECRET` has user-visible side effects.

Per-secret rough shape:

- **`GITHUB_CLIENT_SECRET`** — regenerate in the GitHub OAuth App settings, update `GITHUB_CLIENT_SECRET` in Vercel, redeploy. No user impact (existing sessions are JWTs signed by `NEXTAUTH_SECRET`, not the OAuth secret).
- **`NEXTAUTH_SECRET`** — rotating invalidates every active session. Users will be signed out and need to re-auth. Coordinate or do it during a low-traffic window.
- **`ANTHROPIC_API_KEY`** — generate a new key in the Anthropic console, update Vercel env, redeploy. The arena and `ai-edit` will fail in the gap between deploys; consider a short overlap by setting the new key first, then rotating in the console.
- **`CRON_SECRET`** — Vercel manages this for cron invocations; if you rotate, do it in Vercel project settings.
- **`DATABASE_URL`** — Neon connection strings are bound to a role. If a credential is suspected leaked, rotate the role's password in Neon, then update both Vercel and Railway env (and your `.env.local` for any maintainer running migrations).

For each, fill in:

- Where the secret is stored (Vercel project env, Railway service env, both)
- How to verify the new secret took effect after the rotation (a curl, a sign-in attempt, etc.)
- Whether downtime is expected (the `NEXTAUTH_SECRET` case)

## Provisioning a fresh production environment

The fast version of "we lost everything, rebuild prod":

1. **Neon** — create a project; create the production branch; copy the connection string.
2. **Vercel** — create a project pointing at this repo, root `packages/web`; set every env var from the matrix above; first deploy.
3. **Railway** — create a project pointing at this repo; the build/start commands come from `railway.toml`; set `DATABASE_URL`; deploy.
4. **GitHub OAuth App** — register, set callback to `<NEXTAUTH_URL>/api/auth/callback/github`, populate `GITHUB_CLIENT_ID/SECRET` in Vercel.
5. **Migrations** — `pnpm --filter @claudosseum/db migrate` against the new prod `DATABASE_URL`.
6. **Seed** — `pnpm --filter @claudosseum/db seed` to populate skills + categories from `global/skills/`.
7. **First admin user** — sign in once via the deployed app, then `UPDATE users SET role='admin' WHERE github_login='<you>'` directly in Neon.
8. **Smoke test** — sign in, generate an API token, hit `/health` on the MCP server, run `pnpm arena-test status` from a maintainer machine pointed at the new DB.

## Rollback

- **Vercel deploy** — revert in the Vercel dashboard ("Promote previous deployment").
- **Railway deploy** — same in the Railway dashboard.
- **Database migration** — Drizzle does not generate down-migrations. To revert a migration, write a new forward migration that undoes it, or apply hand-rolled SQL against Neon. **There is no automatic rollback.** This is why migration deployment (above) needs to be a deliberate, gated operation.

## Cross-references

- [`architecture.md`](./architecture.md) — what each subsystem does and where its env vars are read
- [`development.md`](./development.md) — local dev (most of the same env vars apply)
- [`packages/db/README.md`](../packages/db/README.md) — migration mechanics
- [`packages/mcp-server/README.md`](../packages/mcp-server/README.md) — Railway specifics
- [`packages/web/README.md`](../packages/web/README.md) — Vercel specifics
