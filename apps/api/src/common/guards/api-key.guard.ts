import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { assertAccountUsable } from '../utils/user-status';
import * as bcrypt from 'bcrypt';

/**
 * Dual auth guard: supports both API key (X-API-Key header) and JWT (Bearer token).
 * API key auth: sets request.apiKeyId and request.userId (if key is linked to user)
 * JWT auth: sets request.userId
 * After either branch resolves request.userId, the user's account status is enforced
 * and request.userRole is stashed for downstream guards (e.g. RolesGuard).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Try API key first
    const apiKey = request.headers['x-api-key'];
    if (apiKey) {
      await this.authenticateWithApiKey(request, apiKey);
    } else {
      // Try JWT Bearer token
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        await this.authenticateWithJwt(request, authHeader.slice(7));
      } else {
        throw new UnauthorizedException('Missing authentication. Provide X-API-Key header or Bearer token.');
      }
    }

    await this.enforceUserStatus(request);
    return true;
  }

  private async authenticateWithApiKey(request: Record<string, unknown>, apiKey: string): Promise<void> {
    const prefix = apiKey.slice(0, 8);
    const candidates = await this.prisma.apiKey.findMany({
      where: { key: prefix, active: true },
    });

    let key: (typeof candidates)[number] | undefined;
    for (const candidate of candidates) {
      if (await bcrypt.compare(apiKey, candidate.hashedKey)) {
        key = candidate;
        break;
      }
    }

    if (!key) throw new UnauthorizedException('Invalid API key');

    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsed: new Date() },
    });

    request.apiKeyId = key.id;
    request.userId = key.userId ?? undefined;
  }

  private async authenticateWithJwt(request: Record<string, unknown>, token: string): Promise<void> {
    try {
      const secret = this.config.getOrThrow('JWT_SECRET');
      const payload = this.jwt.verify(token, { secret }) as { sub: string; email: string };
      request.userId = payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private async enforceUserStatus(request: Record<string, unknown>): Promise<void> {
    const userId = request.userId as string | undefined;
    if (!userId) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });
    assertAccountUsable(user);
    request.userRole = user!.role;
  }
}
