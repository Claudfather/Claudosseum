import bcrypt from "bcryptjs";
import { apiTokens } from "./schema.js";
import { eq, and, isNull } from "drizzle-orm";
import type { Db } from "./client.js";

const TOKEN_PREFIX = "cd_";

export interface ValidateTokenResult {
  userId: string;
  tokenId: string;
  tokenName: string;
}

export async function validateToken(
  db: Db,
  rawToken: string
): Promise<ValidateTokenResult | null> {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null;

  const prefix = rawToken.slice(0, 11);

  // Look up by prefix to narrow the bcrypt comparison set
  const candidates = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenPrefix, prefix),
        isNull(apiTokens.revokedAt)
      )
    );

  for (const candidate of candidates) {
    // Check expiration
    if (candidate.expiresAt && candidate.expiresAt < new Date()) {
      continue;
    }

    const matches = await bcrypt.compare(rawToken, candidate.tokenHash);
    if (matches) {
      // Update usage stats
      await db
        .update(apiTokens)
        .set({
          lastUsedAt: new Date(),
          totalCalls: candidate.totalCalls + 1,
          successfulCalls: candidate.successfulCalls + 1,
        })
        .where(eq(apiTokens.id, candidate.id));

      return {
        userId: candidate.userId,
        tokenId: candidate.id,
        tokenName: candidate.name,
      };
    }
  }

  return null;
}
