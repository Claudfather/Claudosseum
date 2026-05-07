import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  jsonb,
  integer,
  smallint,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  githubId: integer("github_id").notNull().unique(),
  githubUsername: text("github_username").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── API Tokens ──────────────────────────────────────────────────────────────

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(), // first 8 chars for display: "cd_abc12..."
    name: text("name").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    totalCalls: integer("total_calls").notNull().default(0),
    successfulCalls: integer("successful_calls").notNull().default(0),
    failedCalls: integer("failed_calls").notNull().default(0), // never incremented: always 0
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_tokens_user_id_idx").on(table.userId),
    index("api_tokens_token_prefix_idx").on(table.tokenPrefix),
  ]
);

// ─── Skill Categories ────────────────────────────────────────────────────────

export const skillCategories = pgTable(
  "skill_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    domain: text("domain").notNull(),
    function: text("function").notNull(),
    description: text("description"),
    slug: text("slug").notNull().unique(),
    skillCount: integer("skill_count").notNull().default(0),
    scoringRubric: jsonb("scoring_rubric"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("skill_categories_domain_function_idx").on(table.domain, table.function),
  ]
);

// ─── Skills ──────────────────────────────────────────────────────────────────

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(), // directory name, e.g. "quick-commit"
    name: text("name").notNull(), // from SKILL.md frontmatter "name" field
    description: text("description").notNull(),
    categoryId: uuid("category_id").references(() => skillCategories.id, { onDelete: "set null" }),
    isUserInvocable: boolean("is_user_invocable").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }), // never written: always null
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// ─── Skill Versions ──────────────────────────────────────────────────────────

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: text("version").notNull(), // semver string, e.g. "1.0.0"
    content: text("content").notNull(), // full SKILL.md text including frontmatter
    references: jsonb("references").$type<Record<string, string>>(), // { "references/templates.md": "<file content>" }
    changelog: text("changelog"),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    isLatest: boolean("is_latest").notNull().default(false),
  },
  (table) => [
    uniqueIndex("skill_versions_skill_version_idx").on(table.skillId, table.version),
    index("skill_versions_skill_id_idx").on(table.skillId),
    index("skill_versions_is_latest_idx").on(table.skillId, table.isLatest),
    // Enforce at most one isLatest=true per skill — prevents invisible skills on partial write failure
    uniqueIndex("skill_versions_one_latest_idx")
      .on(table.skillId)
      .where(sql`${table.isLatest} = true`),
  ]
);

// ─── User Skill Pins ────────────────────────────────────────────────────────

export const userSkillPins = pgTable(
  "user_skill_pins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    pinnedVersion: text("pinned_version"), // null = follow latest
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_skill_pins_user_skill_idx").on(table.userId, table.skillId),
  ]
);

// ─── Skill Invocations (Telemetry) ─────────────────────────────────────────

export const skillInvocations = pgTable(
  "skill_invocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(), // deprecated: use skillId
    skillVersion: text("skill_version"), // write-only: logged but never queried
    invokedAt: timestamp("invoked_at", { withTimezone: true }).notNull().defaultNow(),
    sessionId: text("session_id").notNull(), // write-only: indexed but never queried
    success: boolean("success"), // write-only: logged but never queried
    durationMs: integer("duration_ms"), // write-only: logged but never queried
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}), // write-only: logged but never queried
  },
  (table) => [
    index("idx_invocations_skill_id").on(table.skillId),
    index("idx_invocations_skill_slug").on(table.skillSlug),
    index("idx_invocations_user_id").on(table.userId),
    index("idx_invocations_session_id").on(table.sessionId),
    index("idx_invocations_invoked_at").on(table.invokedAt),
  ]
);

// ─── Activity Events ──────────────────────────────────────────────────────

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: [
        "sync",
        "rollback",
        "pin",
        "unpin",
        "feedback",
        "token_generate",
        "token_rotate",
        "publish",
        "version_nudge",
        "feedback_status_change",
      ],
    }).notNull(),
    skillId: uuid("skill_id").references(() => skills.id, { onDelete: "set null" }),
    skillSlug: text("skill_slug"), // deprecated: use skillId
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_activity_events_user_created").on(table.userId, table.createdAt),
    index("idx_activity_events_event_type").on(table.eventType),
    index("idx_activity_events_skill_id").on(table.skillId),
  ]
);

// ─── Skill Feedback ────────────────────────────────────────────────────────

export const skillFeedback = pgTable(
  "skill_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(), // deprecated: use skillId
    skillVersion: text("skill_version"), // write-only: logged but never queried
    rating: smallint("rating").notNull(), // 1-5
    comment: text("comment"),
    sessionId: text("session_id").notNull(), // write-only: indexed but never queried
    status: text("status", {
      enum: ["new", "acknowledged", "in_progress", "resolved"],
    })
      .notNull()
      .default("new"),
    resolvedByVersionId: uuid("resolved_by_version_id").references( // never written: feedback resolution tracking not yet implemented
      () => skillVersions.id,
      { onDelete: "set null" }
    ),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_feedback_skill_id").on(table.skillId),
    index("idx_feedback_skill_slug").on(table.skillSlug),
    index("idx_feedback_user_id").on(table.userId),
    index("idx_feedback_session_id").on(table.sessionId),
    index("idx_feedback_status").on(table.status),
  ]
);

// ─── User Installed Versions ────────────────────────────────────────────────
// NOTE: No write path exists — admin/versions/nudge reads this but nothing populates it.

export const userInstalledVersions = pgTable(
  "user_installed_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(),
    installedVersion: text("installed_version").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_installed_versions_user_skill_idx").on(
      table.userId,
      table.skillSlug
    ),
  ]
);

// ─── Source Configs (Intelligence Pipeline) ─────────────────────────────────

export const sourceConfigs = pgTable(
  "source_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    url: text("url").notNull().unique(),
    sourceType: text("source_type", {
      enum: [
        "anthropic_docs",
        "anthropic_blog",
        "changelog",
        "github_repo",
        "mcp_registry",
        "github_skill_repo",
      ],
    }).notNull(),
    checkFrequency: text("check_frequency", {
      enum: ["daily", "weekly"],
    })
      .notNull()
      .default("daily"),
    isActive: boolean("is_active").notNull().default(true),
    fetchConfig: jsonb("fetch_config")
      .$type<Record<string, string>>()
      .default({}),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_source_configs_active").on(table.isActive)]
);

// ─── Source Snapshots (Intelligence Pipeline) ────────────────────────────────

export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceConfigId: uuid("source_config_id")
      .notNull()
      .references(() => sourceConfigs.id, { onDelete: "cascade" }),
    contentHash: text("content_hash").notNull(),
    rawContent: text("raw_content").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_snapshots_source_fetched").on(
      table.sourceConfigId,
      table.fetchedAt
    ),
  ]
);

// ─── Learnings (Intelligence Pipeline Display Layer) ────────────────────────

export const learnings = pgTable(
  "learnings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    fullContent: text("full_content"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type", {
      enum: [
        "blog",
        "docs",
        "changelog",
        "community",
        "anthropic_docs",
        "anthropic_blog",
        "github_repo",
        "mcp_registry",
      ],
    }).notNull(),
    relevanceTags: text("relevance_tags").array().default([]),
    distilledAt: timestamp("distilled_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", {
      enum: ["new", "reviewed", "applied", "dismissed"],
    })
      .notNull()
      .default("new"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_learnings_status").on(table.status),
    index("idx_learnings_distilled_at").on(table.distilledAt),
    index("idx_learnings_source_type").on(table.sourceType),
  ]
);

// ─── Learning–Skill Links ────────────────────────────────────────────────────

export const learningSkillLinks = pgTable(
  "learning_skill_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    learningId: uuid("learning_id")
      .notNull()
      .references(() => learnings.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    skillSlug: text("skill_slug").notNull(), // deprecated: use skillId
    proposedChange: text("proposed_change"),
    status: text("status", {
      enum: ["pending", "applied", "rejected"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learning_skill_links_unique_v2").on(table.learningId, table.skillId),
    index("idx_learning_skill_links_learning").on(table.learningId),
    index("idx_learning_skill_links_skill_id").on(table.skillId),
    index("idx_learning_skill_links_skill").on(table.skillSlug),
    index("idx_learning_skill_links_status").on(table.status),
  ]
);

// ═══════════════════════════════════════════════════════════════════════════════
// ARENA TABLES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Intake Candidates ──────────────────────────────────────────────────────

export const intakeCandidates = pgTable(
  "intake_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceType: text("source_type", {
      enum: ["github_skill", "web_article", "community_submission", "provider_skills"],
    }).notNull(),
    sourceUrl: text("source_url"),
    rawContent: text("raw_content").notNull(),
    extractedPurpose: text("extracted_purpose"),
    categoryId: uuid("category_id").references(() => skillCategories.id, { onDelete: "set null" }),
    matchedChampionSkillId: uuid("matched_champion_skill_id").references(() => skills.id, {
      onDelete: "set null",
    }),
    fightScore: integer("fight_score"),
    status: text("status", {
      enum: ["new", "categorized", "scored", "queued", "battling", "promoted", "rejected", "dismissed"],
    })
      .notNull()
      .default("new"),
    submittedBy: uuid("submitted_by").references(() => users.id, { onDelete: "set null" }), // never written: intake POST doesn't set this
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_intake_status").on(table.status),
    index("idx_intake_fight_score").on(table.fightScore),
  ]
);

// ─── Battles ────────────────────────────────────────────────────────────────

export const battles = pgTable(
  "battles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    challengerId: uuid("challenger_id")
      .notNull()
      .references(() => intakeCandidates.id, { onDelete: "cascade" }),
    championSkillId: uuid("champion_skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    championVersionId: uuid("champion_version_id")
      .notNull()
      .references(() => skillVersions.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "judging", "complete", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    verdict: text("verdict", {
      enum: ["champion_wins", "challenger_wins", "draw"],
    }),
    verdictSummary: text("verdict_summary"),
    championScore: real("champion_score"),
    challengerScore: real("challenger_score"),
    config: jsonb("config").$type<{
      scenarioCount: number;
      roundsPerScenario: number;
      judgeCount: number;
      winThreshold: number;
    }>().notNull(),
    evolutionBattleId: uuid("evolution_battle_id"),
    totalLlmCalls: integer("total_llm_calls"),
    totalInputTokens: integer("total_input_tokens"),
    totalOutputTokens: integer("total_output_tokens"),
    totalCostCents: real("total_cost_cents"),
    totalLatencyMs: integer("total_latency_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_battles_status").on(table.status),
    index("idx_battles_champion_skill").on(table.championSkillId),
    index("idx_battles_challenger").on(table.challengerId),
  ]
);

// ─── Battle Scenarios ───────────────────────────────────────────────────────

export const battleScenarios = pgTable(
  "battle_scenarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    battleId: uuid("battle_id")
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    scenarioIndex: integer("scenario_index").notNull(),
    description: text("description").notNull(),
    projectContext: text("project_context").notNull(),
    userPrompt: text("user_prompt").notNull(),
    difficulty: text("difficulty", {
      enum: ["easy", "medium", "hard"],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_scenarios_battle").on(table.battleId)]
);

// ─── Battle Rounds ──────────────────────────────────────────────────────────

export const battleRounds = pgTable(
  "battle_rounds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    battleId: uuid("battle_id")
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    scenarioId: uuid("scenario_id")
      .notNull()
      .references(() => battleScenarios.id, { onDelete: "cascade" }),
    roundIndex: integer("round_index").notNull(),
    championOutput: text("champion_output").notNull(),
    challengerOutput: text("challenger_output").notNull(),
    championTokens: integer("champion_tokens"),
    challengerTokens: integer("challenger_tokens"),
    championInputTokens: integer("champion_input_tokens"),
    challengerInputTokens: integer("challenger_input_tokens"),
    championModel: text("champion_model"),
    challengerModel: text("challenger_model"),
    championLatencyMs: integer("champion_latency_ms"),
    challengerLatencyMs: integer("challenger_latency_ms"),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rounds_battle").on(table.battleId),
    index("idx_rounds_scenario").on(table.scenarioId),
  ]
);

// ─── Battle Judgments ───────────────────────────────────────────────────────

export const battleJudgments = pgTable(
  "battle_judgments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roundId: uuid("round_id")
      .notNull()
      .references(() => battleRounds.id, { onDelete: "cascade" }),
    judgeIndex: integer("judge_index").notNull(),
    winnerId: text("winner_id", {
      enum: ["champion", "challenger", "draw"],
    }).notNull(),
    scores: jsonb("scores").$type<{
      champion: Record<string, number> & { total: number };
      challenger: Record<string, number> & { total: number };
    }>().notNull(),
    reasoning: text("reasoning").notNull(),
    confidence: integer("confidence").notNull(),
    model: text("model"),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_judgments_round").on(table.roundId)]
);

// ─── Arena Rankings ─────────────────────────────────────────────────────────

export const arenaRankings = pgTable(
  "arena_rankings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" })
      .unique(),
    categoryId: uuid("category_id").references(() => skillCategories.id, { onDelete: "set null" }),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    winRate: real("win_rate").notNull().default(0),
    eloRating: real("elo_rating").notNull().default(1200),
    title: text("title"),
    lastBattleAt: timestamp("last_battle_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rankings_elo").on(table.eloRating),
  ]
);

// ─── Arena LLM Calls (Observability) ─────────────────────────────────────────

export const arenaLlmCalls = pgTable(
  "arena_llm_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    battleId: uuid("battle_id").references(() => battles.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id").references(() => intakeCandidates.id, { onDelete: "cascade" }),
    callType: text("call_type", {
      enum: [
        "categorize",
        "fight_score",
        "scenario_gen",
        "skill_exec_champion",
        "skill_exec_challenger",
        "judge",
        "evolve",
        "category_council",
        "verdict_synthesis",
      ],
    }).notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"), // write-only: redundant (input + output stored separately)
    latencyMs: integer("latency_ms"),
    costCents: real("cost_cents"),
    status: text("status", {
      enum: ["success", "error", "parse_failure", "rate_limited"],
    }).notNull(), // write-only: logged but never queried
    errorMessage: text("error_message"), // write-only: stored but never queried
    rawResponse: text("raw_response"), // write-only: stored but never queried
    parentEntityId: uuid("parent_entity_id"),
    parentEntityType: text("parent_entity_type", {
      enum: ["battle_round", "battle_scenario", "battle_judgment", "intake_candidate"],
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_llm_calls_battle").on(table.battleId),
    index("idx_llm_calls_candidate").on(table.candidateId),
    index("idx_llm_calls_call_type").on(table.callType),
    index("idx_llm_calls_created_at").on(table.createdAt),
  ]
);

// ─── Arena ELO History ───────────────────────────────────────────────────────
// NOTE: Write-only table — records ELO history but no API or UI reads this data yet.

export const arenaEloHistory = pgTable(
  "arena_elo_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    battleId: uuid("battle_id")
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    eloBefore: real("elo_before").notNull(),
    eloAfter: real("elo_after").notNull(),
    eloChange: real("elo_change").notNull(),
    opponentElo: real("opponent_elo").notNull(),
    outcome: text("outcome", {
      enum: ["win", "loss", "draw"],
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_elo_history_skill").on(table.skillId),
    index("idx_elo_history_battle").on(table.battleId),
  ]
);

// ─── Arena Pipeline Events ───────────────────────────────────────────────────
// NOTE: Internal observability only — never exposed to any API or UI.

export const arenaPipelineEvents = pgTable(
  "arena_pipeline_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: text("entity_type", {
      enum: ["candidate", "battle"],
    }).notNull(),
    entityId: uuid("entity_id").notNull(),
    phase: text("phase").notNull(),
    previousPhase: text("previous_phase"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pipeline_events_entity").on(table.entityId),
    index("idx_pipeline_events_phase").on(table.phase),
    index("idx_pipeline_events_created_at").on(table.createdAt),
  ]
);
