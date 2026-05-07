# @claudiator/mcp-server

Streamable HTTP MCP server hosted on Railway. Exposes 9 tools backed by the Claudiator database, used by Claude Code clients via the `claudiator-sync` skill.

Production: `https://mcp.the-claudiator.railway.app/mcp`

## Stack

- Express on top of `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport`
- Reads/writes via `@claudiator/db` (Neon Postgres)
- Bearer-token auth against the `apiTokens` table

## Layout

```
src/
  index.ts     Express app, /health + /mcp endpoints, session map, auth middleware
  server.ts    Registers all 9 tools on the MCP server
  tools/       One file per tool (sync, check-updates, whoami, log-invocation,
               session-feedback, rollback, pin, unpin, publish)
```

## Endpoints

| Path | Purpose |
|------|---------|
| `GET /health` | Returns `{ status: "ok" }`. Railway healthcheck (`healthcheckTimeout: 30`). |
| `ALL /mcp` | Streamable HTTP MCP transport. Sessions keyed by `mcp-session-id`. |

## Tools

| Tool | One-liner |
|------|-----------|
| `claudiator_sync` | Fetch skill versions from registry; client writes them under `~/.claude/skills/`. |
| `claudiator_check_updates` | Compare installed manifest vs registry; returns updates / new / removed / pinned / up_to_date. |
| `claudiator_whoami` | Return GitHub identity, role, and token status for the caller. |
| `claudiator_log_invocation` | Fire-and-forget: record a skill invocation in `skill_invocations`. |
| `claudiator_session_feedback` | Submit end-of-session 1–5 ratings (writes `skill_feedback`). |
| `claudiator_rollback` | Fetch a prior version of a skill from the registry. |
| `claudiator_pin` | Pin a skill to a specific version (skipped on subsequent syncs). |
| `claudiator_unpin` | Remove a version pin. |
| `claudiator_publish` | **Admin-only.** Publish a new skill version (uses `@claudiator/db/publish`). |

Each tool is a single file under `src/tools/`. Registration is in `src/server.ts`.

## Auth

Every `/mcp` request must carry `Authorization: Bearer cf_…`. The middleware (`src/index.ts`) calls `validateToken(db, token)` from `@claudiator/db/auth`:

1. Look up by `tokenPrefix` (first 11 chars of the raw token)
2. bcrypt-compare against the stored hash
3. Reject if revoked or expired
4. Bump `lastUsedAt` / `totalCalls` / `successfulCalls`
5. Resolve the `userId` and attach to the request

`claudiator_publish` additionally requires `users.role === "admin"`. There is no separate admin token type — role is set in the database.

## Local dev

```bash
# Required: DATABASE_URL pointing at a Neon branch
pnpm --filter @claudiator/db build           # mcp-server depends on db's dist
pnpm --filter @claudiator/mcp-server dev     # tsx src/index.ts on port 8080
```

`PORT` is configurable; default is `8080`.

## Deployment (Railway)

Configured via `/railway.toml` at the repo root:

```toml
[build]
buildCommand = "pnpm --filter @claudiator/db build && pnpm --filter @claudiator/mcp-server build"
watchPatterns = ["/packages/mcp-server/**", "/packages/db/**"]

[deploy]
startCommand = "node packages/mcp-server/dist/index.js"
healthcheckPath = "/health"
healthcheckTimeout = 30
```

The `@claudiator/db` build must run first — `mcp-server` imports compiled output, not source.

Required Railway env: `DATABASE_URL`. Optional: `PORT`.

## Gotchas

- **Token prefix must be `cf_`** — anything else is rejected before the bcrypt step. See `validateToken` in `packages/db/src/auth.ts`.
- **Stale `@claudiator/db` dist breaks the server** — Railway's build command rebuilds db each time, but locally you must rebuild manually after schema changes.
- **Sessions live in an in-memory `Map`** — the server is single-instance. Horizontal scaling would need an external session store.
- **`publish` failures are silent for non-admins** — the tool returns an error; clients should surface it to the user.
