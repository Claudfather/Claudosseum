import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createDb } from "@claudosseum/db/client";
import { apiTokens } from "@claudosseum/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

const TOKEN_PREFIX = "cd_";
const TOKEN_BYTES = 32; // 32 bytes = 64 hex chars + "cd_" prefix = 67 chars total
const BCRYPT_ROUNDS = 12;

// Note: validateToken lives in @claudosseum/db/auth (shared by MCP server and web app)
// This module only handles token generation, revocation, and rotation (web-only operations)

export interface GenerateTokenResult {
  id: string;
  rawToken: string; // Shown ONCE to the user, then never stored
  name: string;
  prefix: string;
  expiresAt: Date | null;
}

export async function generateToken(
  userId: string,
  name: string,
  expiresInDays: number | null
): Promise<GenerateTokenResult> {
  const rawBytes = randomBytes(TOKEN_BYTES);
  const rawToken = TOKEN_PREFIX + rawBytes.toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
  const tokenPrefix = rawToken.slice(0, 11); // "cd_" + first 8 hex = "cd_abc12345"
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [token] = await db
    .insert(apiTokens)
    .values({
      userId,
      tokenHash,
      tokenPrefix,
      name,
      expiresAt,
    })
    .returning();

  return {
    id: token.id,
    rawToken,
    name,
    prefix: tokenPrefix,
    expiresAt,
  };
}

export async function revokeToken(
  tokenId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));

  return (result as any).rowCount > 0;
}

export async function rotateToken(
  tokenId: string,
  userId: string
): Promise<GenerateTokenResult | null> {
  // Get the existing token's metadata
  const [existing] = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt)
      )
    );

  if (!existing) return null;

  // Prepare new token values before entering the transaction
  const rawBytes = randomBytes(TOKEN_BYTES);
  const rawToken = TOKEN_PREFIX + rawBytes.toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
  const tokenPrefix = rawToken.slice(0, 11);
  const remainingDays = existing.expiresAt
    ? Math.max(
        1,
        Math.ceil(
          (existing.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        )
      )
    : null;
  const expiresAt = remainingDays
    ? new Date(Date.now() + remainingDays * 24 * 60 * 60 * 1000)
    : null;

  // Batch: insert new token + revoke old one atomically.
  // If insert fails, old token remains valid (neon-http wraps batch in BEGIN/COMMIT).
  const results = await db.batch([
    db.insert(apiTokens)
      .values({
        userId,
        tokenHash,
        tokenPrefix,
        name: existing.name,
        expiresAt,
      })
      .returning(),
    db.update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(apiTokens.id, tokenId)),
  ]);

  const newToken = results[0][0];

  return {
    id: newToken.id,
    rawToken,
    name: existing.name,
    prefix: tokenPrefix,
    expiresAt,
  };
}
