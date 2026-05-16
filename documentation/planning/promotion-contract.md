# Promotion Contract — Arena to clauDNA

Spec for how skills graduate from Claudosseum arena testing to production distribution in clauDNA. Addresses issue #42.

## Overview

A skill enters Claudosseum as an `intakeCandidates` record, battles through the arena, and accumulates ELO + telemetry signal. When it crosses defined thresholds, it becomes eligible for promotion to clauDNA's canonical skill set. This document defines the criteria, artifact format, handoff mechanism, rollback path, and human gate.

## 1. Promotion Criteria

A skill is **promotion-eligible** when ALL of the following are met. No single signal is sufficient — the mission is explicit that "ELO + telemetry beats ELO alone."

### 1.1 Arena Performance (ELO + Battle Record)

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| ELO rating | >= 1400 | 200 points above the 1200 baseline. A skill must meaningfully outperform the starting field, not just survive. |
| Minimum battles | >= 5 | Enough data for ELO to stabilize. Below 5, a lucky matchup can inflate the rating. |
| Win rate | >= 0.60 | More wins than losses. A skill at 0.50 hasn't proven superiority. |
| No active losing streak | Last 3 battles must include at least 1 win. "Last 3" is determined by `battles.completedAt DESC`; ties broken by `battles.id` (UUID v4 creation order). | Catches skills in decline. A skill that hit 1400 but then lost 3 straight is regressing. |
| Category champion or runner-up | Top 2 in `arenaRankings` for its `categoryId` by ELO | Promotion is per-category. Only the best in a category graduate. |

### 1.2 Judge Confidence

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| Mean judge confidence | >= 65 (across all battles) | Judges self-report confidence (0-100) in `battleJudgments.confidence`. Low confidence means the scenarios didn't clearly differentiate the skill. |
| No battle with mean confidence < 40 | Zero | A single badly-judged battle is a data quality flag. The skill needs re-evaluation, not promotion. |

Computed from: `battleJudgments.confidence` across all `battleRounds` for all `battles` where the skill was champion or a winning challenger.

### 1.3 Telemetry Signal (Production Usage)

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| Minimum invocations | >= 50 | Enough usage to be statistically meaningful. From `skillInvocations` where `skillId` matches. |
| Success rate | >= 0.85 | `skill_invocations.success = true` / total invocations. A skill that errors 20% of the time doesn't ship. |
| Distinct users | >= 3 | Not just one person's pet skill. At least 3 distinct `userId` values in `skillInvocations`. |
| Time in production | >= 7 days | Measured from earliest `skillInvocations.invokedAt` to latest. Catches skills that get 50 invocations in a burst but no sustained use. |

**Telemetry is opt-in.** If a skill has zero telemetry (no `skillInvocations` rows), it cannot be promoted. This is deliberate: the mission says "ELO + telemetry beats ELO alone." A skill with only arena results hasn't proven itself in the real world.

### 1.4 Lineage and Provenance

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| Version pinned | `skillVersions.isLatest = true` on the version being promoted | Don't promote a stale version. The latest published version is what gets evaluated. |
| Category assigned | `skills.categoryId IS NOT NULL` | Uncategorized skills can't be evaluated against rubrics. |
| Content non-empty | `skillVersions.content` is non-null, >= 100 characters | Sanity check. No empty shells. |

### 1.5 Criteria Summary Table

```
PROMOTION ELIGIBLE = ALL OF:
  Arena:     ELO >= 1400  AND  battles >= 5  AND  winRate >= 0.60
             AND  top 2 in category  AND  no 3-loss streak at tail
  Judges:    mean confidence >= 65  AND  no battle with mean confidence < 40
  Telemetry: invocations >= 50  AND  successRate >= 0.85
             AND  distinctUsers >= 3  AND  timeInProduction >= 7 days
  Lineage:   isLatest = true  AND  categoryId NOT NULL  AND  content >= 100 chars
```

### 1.6 Threshold Calibration

These thresholds are starting points. After the first 10 promotion cycles, review:

- If zero skills qualify: ELO or invocation thresholds are too high. Lower ELO to 1350 or invocations to 30.
- If too many qualify (>5 per cycle): raise ELO to 1450 or add a distinctUsers >= 5 requirement.
- Win rate and success rate should be stable. Judge confidence may need recalibration as rubrics improve.

Log every promotion evaluation (pass/fail per criterion) to a new `promotionEvaluations` table for retroactive analysis.

## 2. Artifact Format

When a skill is promoted, Claudosseum produces a **promotion package** — a self-contained bundle that clauDNA can consume without querying Claudosseum at runtime. This satisfies the mission constraint: "other repos must work without hosted Claudosseum."

### 2.1 Package Structure

```
promotion-package/
  manifest.json          # metadata, criteria snapshot, version
  SKILL.md               # skill content (from skillVersions.content)
  battle-history.json    # summarized arena record
  telemetry-summary.json # anonymized usage stats
```

### 2.2 manifest.json

```json
{
  "schema_version": "1.0.0",
  "promotion": {
    "promoted_at": "2026-05-16T14:30:00Z",
    "promoted_by": "claudosseum-gate",
    "gate_type": "auto_with_human_confirm",
    "human_approver": null
  },
  "skill": {
    "id": "uuid",
    "slug": "review-pr",
    "name": "PR Review",
    "version": "2.1.0",
    "category": {
      "domain": "code-review",
      "function": "pr",
      "slug": "code-review-pr"
    },
    "content_hash": "sha256:abc123..."
  },
  "criteria_snapshot": {
    "elo_rating": 1487,
    "battles": 8,
    "win_rate": 0.75,
    "wins": 6,
    "losses": 2,
    "draws": 0,
    "mean_judge_confidence": 72,
    "min_battle_confidence": 58,
    "invocations": 127,
    "success_rate": 0.92,
    "distinct_users": 5,
    "days_in_production": 14
  },
  "lineage": {
    "parent_candidates": ["uuid-1", "uuid-2"],
    "evolution_depth": 1,
    "original_source_type": "community_submission",
    "original_source_url": "https://github.com/user/skills-repo"
  },
  "claudna": {
    "target_version": "0.4.0",
    "replaces_skill": null,
    "is_update": false
  }
}
```

### 2.3 battle-history.json

Summarized, not raw. Full battle data stays in Claudosseum. The history is provenance for trust, not a data dump.

```json
{
  "total_battles": 8,
  "record": { "wins": 6, "losses": 2, "draws": 0 },
  "elo_trajectory": [
    { "battle_id": "uuid", "date": "2026-05-02", "elo_before": 1200, "elo_after": 1232, "outcome": "win", "opponent_elo": 1200 },
    { "battle_id": "uuid", "date": "2026-05-05", "elo_before": 1232, "elo_after": 1278, "outcome": "win", "opponent_elo": 1245 }
  ],
  "notable_battles": [
    {
      "battle_id": "uuid",
      "date": "2026-05-10",
      "opponent_slug": "review-pr-legacy",
      "verdict": "challenger_wins",
      "score": { "champion": 72, "challenger": 84 },
      "summary": "Challenger produced more actionable feedback with specific line references..."
    }
  ],
  "evolution_chain": [
    { "generation": 0, "source": "community_submission", "candidate_id": "uuid" },
    { "generation": 1, "source": "evolution", "parent_battle_id": "uuid", "candidate_id": "uuid" }
  ]
}
```

### 2.4 telemetry-summary.json

Anonymized. No user IDs, no session content. Aggregate stats only.

```json
{
  "period": {
    "from": "2026-05-01",
    "to": "2026-05-16"
  },
  "invocations": 127,
  "success_rate": 0.92,
  "failure_rate": 0.08,
  "distinct_users": 5,
  "median_duration_ms": 3200,
  "p95_duration_ms": 8400,
  "invocations_by_day": [
    { "date": "2026-05-01", "count": 8 },
    { "date": "2026-05-02", "count": 12 }
  ]
}
```

### 2.5 Content Hash Verification

`manifest.json` includes `content_hash` — SHA-256 of the `SKILL.md` file. clauDNA verifies this on import. If the hash doesn't match, the package is rejected. Prevents tampering between Claudosseum and clauDNA.

## 3. Handoff Protocol

### 3.1 Mechanism: Pull Request to clauDNA

Claudosseum does NOT push skills to clauDNA via API or webhook. It opens a PR. This satisfies multiple constraints:

- **No runtime dependency.** clauDNA never calls Claudosseum. The PR is a static artifact.
- **Human-reviewable.** The PR diff shows exactly what's being added or changed.
- **Git-native.** clauDNA is a git repo. PRs are the standard change mechanism.
- **Auditable.** The PR body contains the full criteria snapshot. Anyone can verify the promotion was earned.

### 3.2 PR Flow

```
Claudosseum gate evaluator runs (cron or manual trigger)
    │
    ▼
Skill meets all criteria? ──No──► logged as "not yet eligible", no action
    │
   Yes
    │
    ▼
Build promotion package (manifest + SKILL.md + history + telemetry)
    │
    ▼
Create branch: promote/<skill-slug>-<version>
    │
    ▼
Commit promotion package to clauDNA repo
    │  Files placed at: skills/<category-slug>/<skill-slug>/
    │    SKILL.md
    │    .promotion/manifest.json
    │    .promotion/battle-history.json
    │    .promotion/telemetry-summary.json
    │
    ▼
Open PR with structured body:
    │  Title: "promote: <skill-slug> v<version> (ELO <rating>, <wins>W-<losses>L)"
    │  Body: criteria table, battle highlights, telemetry summary, lineage
    │  Labels: "arena-promotion", "<category-domain>"
    │
    ▼
PR awaits merge (human or auto, per gate type — see section 5)
```

### 3.3 PR Body Template

```markdown
## Arena Promotion: <skill-name>

**Category:** <domain>/<function>
**Version:** <version>
**Promoted by:** Claudosseum arena gate

### Criteria

| Criterion | Required | Actual | Status |
|-----------|----------|--------|--------|
| ELO | >= 1400 | 1487 | PASS |
| Battles | >= 5 | 8 | PASS |
| Win rate | >= 0.60 | 0.75 | PASS |
| Judge confidence | >= 65 | 72 | PASS |
| Invocations | >= 50 | 127 | PASS |
| Success rate | >= 0.85 | 0.92 | PASS |
| Distinct users | >= 3 | 5 | PASS |
| Time in prod | >= 7 days | 14 days | PASS |

### Battle Highlights

- Beat `review-pr-legacy` (84 vs 72): "More actionable feedback with specific line references"
- Beat `review-pr-basic` (79 vs 68): "Better handling of multi-file changes"

### Lineage

Community submission → 1 evolution cycle → promoted

### Telemetry

127 invocations over 14 days, 92% success rate, 5 distinct users.
Median duration: 3.2s, P95: 8.4s.
```

### 3.4 GitHub Mechanics

Claudosseum uses a GitHub App (or PAT) with write access to the clauDNA repo. The gate evaluator:

1. Clones clauDNA (or uses the GitHub API to create commits via tree/blob API)
2. Creates a branch from `main`
3. Commits the promotion package
4. Opens the PR via `gh pr create` or the GitHub API
5. Applies labels

The PR targets `main`. clauDNA's CI runs whatever validation it has (linting, schema checks). The PR is then merged per the gate rules in section 5.

## 4. Rollback (Demotion)

The mission says "promotion is irreversible-ish." The bar to enter is high so the bar to exit doesn't get hit often. But when it does:

### 4.1 Demotion Triggers

| Trigger | Detection | Severity |
|---------|-----------|----------|
| Success rate drops below 0.70 post-promotion | Telemetry monitoring (weekly check) | High — skill is actively failing |
| ELO drops below 1300 after continued arena battles | Arena rankings check | Medium — skill is losing to better alternatives |
| Zero invocations for 30+ days | Telemetry monitoring | Low — skill may be abandoned, not broken |
| Manual report | Human files issue on clauDNA | Variable |

### 4.2 Demotion Process

Demotion is NOT automatic. It opens a **demotion PR** on clauDNA:

```
Demotion trigger detected
    │
    ▼
Claudosseum creates demotion package:
    │  - Current telemetry showing regression
    │  - ELO trajectory showing decline
    │  - Comparison to promotion-time metrics
    │
    ▼
Open PR on clauDNA:
    │  Title: "demote: <skill-slug> — <reason>"
    │  Body: regression evidence, original promotion metrics vs current
    │  Labels: "arena-demotion"
    │  Action: removes SKILL.md, moves .promotion/ to .promotion/archived/
    │
    ▼
Human reviews and merges (demotion is ALWAYS human-gated)
```

### 4.3 What Happens to Demoted Skills

- Removed from clauDNA's canonical set in the next release
- Remain in Claudosseum's arena with their full history (no data deleted)
- Can re-enter the promotion pipeline if they improve
- The demotion is logged in `arenaEloHistory` with a special event type

### 4.4 Soft Demotion: Deprecation Warning

Before full demotion, skills can be marked as deprecated in clauDNA:

- Add a `deprecated: true` flag to the skill's manifest
- clauDNA surfaces a warning when the skill is invoked
- If the skill recovers (telemetry improves), the deprecation is lifted
- If it doesn't recover within 30 days, full demotion PR opens

## 5. Human Gate

### 5.1 Gate Types

| Gate Type | When It Applies | Who Merges |
|-----------|----------------|------------|
| **Human required** | First promotion in a new category | Human maintainer |
| **Human required** | Skill replaces an existing clauDNA skill | Human maintainer |
| **Human required** | Evolved skill (has `evolution_depth > 0`) | Human maintainer |
| **Human required** | All demotions | Human maintainer |
| **Auto-merge eligible** | Version update to already-promoted skill, all criteria met, no category change | CI merges after 24h hold |

### 5.2 Auto-Merge Rules

A promotion PR is eligible for auto-merge ONLY when ALL of:

1. The skill slug already exists in clauDNA (this is an update, not a new addition)
2. The category has not changed
3. All promotion criteria pass with headroom (ELO >= 1450, not just 1400; success rate >= 0.90, not just 0.85)
4. The PR has been open for >= 24 hours with no objections
5. clauDNA CI passes

The 24-hour hold gives maintainers time to review if they want to. Auto-merge is a convenience for routine version bumps, not a bypass of oversight.

### 5.3 What "Human Required" Means

The PR is opened. Labels are applied. The PR body contains all the evidence. A human maintainer reviews and merges (or closes with feedback). Claudosseum does not ping, nag, or auto-close. The PR sits until a human acts on it.

If a human-required PR sits unmerged for 30 days, Claudosseum updates the PR body with refreshed metrics (the skill may have improved or regressed since the PR was opened) and adds a comment noting the refresh.

## 6. Implementation Phases

This spec is the design. Implementation follows as separate issues:

### Phase A: Gate Evaluator

- New cron or manual trigger that checks all skills against promotion criteria
- Reads from `arenaRankings`, `arenaEloHistory`, `battleJudgments`, `skillInvocations`
- Logs evaluation results to a new `promotionEvaluations` table
- Outputs list of promotion-eligible skills

### Phase B: Artifact Builder

- Builds the promotion package (manifest, SKILL.md, battle-history, telemetry-summary)
- Content hash generation and verification
- Telemetry anonymization

### Phase C: Handoff Endpoint

- GitHub integration: branch creation, commit, PR opening
- PR body template rendering
- Label application
- Auto-merge eligibility check + 24h timer

### Phase D: Demotion Monitor

- Weekly telemetry check for promoted skills
- Regression detection against promotion-time baselines
- Demotion PR generation
- Deprecation warning flow

### Phase E: Observability

- `promotionEvaluations` table: per-skill, per-criterion pass/fail, evaluated_at
- Dashboard page in Claudosseum web showing promotion pipeline status
- Threshold calibration tooling after first 10 cycles

## 7. Open Questions for Maintainer Sign-Off

1. **ELO threshold of 1400:** conservative enough? The K_FACTOR=32 and 1200 baseline mean a skill needs ~6 net wins against equal opponents to reach 1400. Adjust?

2. **Telemetry minimum of 50 invocations:** this requires real fleet usage before promotion. If early-stage Claudosseum has few fleets emitting telemetry, this could bottleneck the entire pipeline. Consider a bootstrapping exception for the first N promotions?

3. **Auto-merge for version updates:** is the 24-hour hold sufficient? Should version updates also require human approval until the auto-merge pipeline is proven?

4. **Demotion soft-deprecation window of 30 days:** too long? Too short? Should it vary by category?

5. **GitHub App vs PAT for clauDNA write access:** the handoff needs repo write permissions. GitHub App is cleaner (scoped, rotatable). PAT is simpler. Which does the team prefer?
