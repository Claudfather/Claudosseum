# claudosseum

Skill intelligence engine for Claude Code. Registry-backed skill distribution with versioning, telemetry, feedback, and an automated arena for evaluating and evolving skills through gladiator-style combat.

## Architecture

```
packages/
  db/           → PostgreSQL schema (Neon serverless), Drizzle ORM
  mcp-server/   → Railway-hosted MCP server (Streamable HTTP transport)
  web/          → Next.js web app on Vercel (GitHub OAuth, token management)
```

## Skills Platform (Beta)

Claudosseum includes a centralized skills registry that replaces git-clone sync with a database-backed distribution system.

### Setup

1. Log in at https://claudosseum.vercel.app with your GitHub account
2. Generate an API key on the dashboard
3. Add the MCP server to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "claudosseum": {
      "type": "http",
      "url": "https://claudosseummcp-server-production.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

4. Restart Claude Code. The `claudosseum_sync` tool will be available.

No local installation required — the MCP server is hosted on Railway.

### MCP Tools

| Tool | Description |
|------|-------------|
| `claudosseum_sync` | Fetch latest skills from registry and write to `~/.claude/skills/` |
| `claudosseum_check_updates` | Check for available skill updates |
| `claudosseum_whoami` | Show your identity and token status |
| `claudosseum_log_invocation` | Log skill invocation for telemetry |
| `claudosseum_session_feedback` | Submit end-of-session skill ratings |
| `claudosseum_rollback` | Roll back a skill to a previous version |
| `claudosseum_pin` | Pin a skill to a specific version |
| `claudosseum_unpin` | Unpin a skill to resume tracking latest |
| `claudosseum_publish` | Publish a new skill version (admin) |

## Arena

The arena discovers skills from the wild, evaluates them through automated battles against existing champions, and evolves the strongest versions through natural selection.

- **Intake** — Submit skill candidates via URL or raw content. LLM-powered categorization and fight-worthiness scoring.
- **Battles** — 3 scenarios x 1 round x 5 judges per battle. Sonnet executes skills, Haiku judges them.
- **Rankings** — ELO-based leaderboard with titles (The Undefeated, The Veteran, The Contender, The Fallen).
- **Evolution** — Close-loss battles trigger LLM-driven skill evolution that combines the best of both competitors.

UI at `/arena/` (overview), `/arena/intake/` (queue), `/arena/leaderboard/` (rankings, with `/arena/rankings/` redirecting here), `/arena/battles/` (battle index), `/arena/[battleId]/` (battle detail), `/arena/categories/` and `/arena/categories/[slug]/` (category management with rubrics).

Kill switch: set `ARENA_ENABLED=false` to disable all arena endpoints.

## Development

```bash
pnpm install
pnpm --filter @claudosseum/db run build
pnpm --filter @claudosseum/mcp-server run build
pnpm --filter @claudosseum/web run dev
```

### Environment Variables

**Railway (MCP server):**
- `DATABASE_URL` — Neon PostgreSQL connection string

**Vercel (web app):**
- `DATABASE_URL` — Neon PostgreSQL connection string
- `GITHUB_CLIENT_ID` — GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App client secret
- `NEXTAUTH_URL` — Web app URL
- `NEXTAUTH_SECRET` — Random secret for NextAuth
- `NEXT_PUBLIC_MCP_SERVER_URL` — MCP server URL for config snippet
- `ANTHROPIC_API_KEY` — Required for arena LLM calls (categorization, judging, evolution)
- `ARENA_ENABLED` — Set to `false` to disable arena endpoints (default: enabled)
