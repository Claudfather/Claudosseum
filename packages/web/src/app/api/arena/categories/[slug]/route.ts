import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudosseum/db/client";
import {
  skillCategories,
  skills,
  arenaRankings,
} from "@claudosseum/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (process.env.ARENA_ENABLED === "false") {
    return NextResponse.json({ error: "Arena disabled" }, { status: 503 });
  }

  const { slug } = await params;

  const [category] = await db
    .select()
    .from(skillCategories)
    .where(eq(skillCategories.slug, slug))
    .limit(1);

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Skills in this category with their rankings
  const categorySkills = await db
    .select({
      skillId: skills.id,
      skillName: skills.name,
      skillSlug: skills.slug,
      skillDescription: skills.description,
      wins: arenaRankings.wins,
      losses: arenaRankings.losses,
      draws: arenaRankings.draws,
      winRate: arenaRankings.winRate,
      eloRating: arenaRankings.eloRating,
      title: arenaRankings.title,
      lastBattleAt: arenaRankings.lastBattleAt,
    })
    .from(skills)
    .leftJoin(arenaRankings, eq(arenaRankings.skillId, skills.id))
    .where(eq(skills.categoryId, category.id))
    .orderBy(desc(arenaRankings.eloRating));

  return NextResponse.json({
    ...category,
    skills: categorySkills,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if ((session as any)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { slug } = await params;
  const body = await request.json();
  const { description, scoringRubric } = body;

  if (scoringRubric) {
    if (!scoringRubric.dimensions || scoringRubric.dimensions.length !== 4) {
      return NextResponse.json(
        { error: "Rubric must have exactly 4 dimensions" },
        { status: 400 }
      );
    }
    for (const d of scoringRubric.dimensions) {
      if (!d.key || !d.label || !d.description || d.maxScore !== 25) {
        return NextResponse.json(
          { error: "Each dimension needs key, label, description, and maxScore=25" },
          { status: 400 }
        );
      }
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (description !== undefined) updates.description = description;
  if (scoringRubric !== undefined) updates.scoringRubric = scoringRubric;

  const result = await db
    .update(skillCategories)
    .set(updates)
    .where(eq(skillCategories.slug, slug))
    .returning({ id: skillCategories.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
