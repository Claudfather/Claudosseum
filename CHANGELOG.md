# Changelog

## [Unreleased]

### Added

- **Rebrand: Claudefather to Claudosseum** — All packages (`@claudosseum/db`, `@claudosseum/web`, `@claudosseum/mcp-server`), MCP tool names (`claudosseum_*`), UI text, pipeline references, global skills, docs, and config updated. Skill directory renamed to `claudosseum-sync`. GitHub repo renamed to `claudosseum`. API token prefix changed from `cf_` to `cd_`. Default Railway hostname updated to `claudosseummcp-server-production.up.railway.app`; default Vercel deployment to `claudosseum.vercel.app` (production env vars override these defaults until the platform-side renames complete).
- **Arena schema** — 6 new tables: `intake_candidates`, `battles`, `battle_scenarios`, `battle_rounds`, `battle_judgments`, `arena_rankings`. Migration: `0003_arena_schema.sql`.
- **Arena intake system** — LLM-powered categorization and fight-worthiness scoring for skill candidates. API routes for submitting, categorizing, and scoring candidates.
- **Arena battle engine** — Matchmaker, scenario generation (3 per battle), parallel skill execution via Sonnet, 5-judge panel via Haiku, majority-vote aggregation. Full orchestration in `executeBattle()`.
- **Arena rankings** — ELO-based ranking system (K=32) with personified titles: The Undefeated, The Veteran, The Contender, The Fallen, The Newcomer.
- **Arena evolution** — Detects close-loss battles, generates evolved skill versions combining best techniques from both competitors, auto-creates follow-up battles.
- **Arena UI** — Overview page with stats and recent battles, intake queue with action buttons, battle detail with side-by-side outputs and judgment cards, rankings leaderboard. Dark terminal theme with gold (champion) and copper (challenger) accents.
- **Arena kill switch** — `ARENA_ENABLED=false` env var disables all arena API endpoints.
- **Arena nav link** — Added to main navigation bar.

### Previously added

- **Usage telemetry schema** — Two new Drizzle tables: `skill_invocations` (per-invocation logging) and `skill_feedback` (end-of-session ratings). Indexed for Workshop and Dashboard queries. Audit logging consolidated into the broader `activity_events` table (see below).
- **`claudosseum_log_invocation` MCP tool** — Fire-and-forget skill invocation logging. Called by the PostToolUse hook or explicitly by skills that want to report duration/metadata.
- **`claudosseum_session_feedback` MCP tool** — End-of-session skill ratings (1-5) with optional comments.
- **PostToolUse telemetry hook** — `posttooluse-telemetry.sh` automatically detects Skill tool invocations and logs them to a session-local JSONL file. Zero-touch for skill authors.
- **Telemetry API endpoints (read-only)** — GET `/api/telemetry/stats/:skillSlug`, GET `/api/telemetry/overview`. Write operations handled exclusively by MCP tools.
- **Claudosseum Platform permission category** — New opt-in category in `recommended-permissions.json` for MCP tool auto-approval.
- **Shared telemetry instructions** — `global/skills/_shared/telemetry-instructions.md` reference for skills that want to report duration/metadata.

- **`activity_events` audit trail table** — Drizzle table for logging sync, rollback, pin, unpin, and other user activity with JSONB details. (Originally drafted as `sync_events`; broadened to cover all activity event types.)
- **`claudosseum_rollback` MCP tool** — Fetch a previous version of a skill from the registry for rollback. Supports specific version or "previous" shorthand.
- **`claudosseum_pin` MCP tool** — Pin a skill to a specific version. Pinned skills are skipped during sync.
- **`claudosseum_unpin` MCP tool** — Remove version pin from a skill, resuming tracking of latest.
- **`claudosseum_publish` MCP tool** — Admin-only tool to publish new skill versions with changelog entries. Supports explicit version or auto-bump (patch/minor/major).
- **`/claudosseum-sync` skill** — New skill at `global/skills/claudosseum-sync/SKILL.md` with MCP-backed sync protocol and legacy git-based fallback via `references/sync-protocol.md`.

### Changed

- **`claudosseum_check_updates` enhanced** — Now returns structured JSON with `updates`, `new_skills`, `removed_skills`, `pinned_skills`, and `up_to_date` categories instead of plain text.
- **`claudosseum_sync` enhanced** — Now accepts version-aware input `{skills: [{slug, version, action}]}` and logs sync events to the audit trail.
- **`/session-handoff` telemetry integration** — New Steps 3.5 (submit telemetry) and 3.6 (collect feedback) between changelog and handoff file writing. Telemetry submission is silent; feedback collection is one-prompt opt-in.

---

- **Skills platform foundation** — New `packages/` monorepo with three packages:
  - `@claudosseum/db`: PostgreSQL schema (Neon serverless) with tables for users, API tokens, skills, skill versions, and user skill pins. Drizzle ORM for type-safe queries. Seed script imports all 38 skills as v1.0.0.
  - `@claudosseum/mcp-server`: Railway-hosted MCP server (Streamable HTTP transport) with three tools — `claudosseum_sync` (fetch skills from registry, returns content for Claude Code to write), `claudosseum_check_updates` (check for newer versions), `claudosseum_whoami` (show auth status). Connects directly to Neon database.
  - `@claudosseum/web`: Next.js web app on Vercel with GitHub OAuth login, API token management (generate, revoke, rotate), connection health metrics, and MCP configuration snippet.
