import { UnauthorizedException } from '@nestjs/common';

/**
 * Builds a Prisma `where` clause that scopes a record by ownership.
 * Uses userId if available (JWT auth), otherwise apiKeyId (API key auth).
 * Throws if neither is available — prevents unscoped queries.
 */
export function ownedWhere(
  id: string,
  auth: { userId?: string; apiKeyId?: string },
): Record<string, unknown> {
  if (auth.userId) return { id, userId: auth.userId };
  if (auth.apiKeyId) return { id, apiKeyId: auth.apiKeyId };
  throw new UnauthorizedException('Cannot determine resource owner');
}
