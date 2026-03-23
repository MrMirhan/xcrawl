import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../modules/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

/**
 * Dual auth guard: supports both API key (X-API-Key header) and JWT (Bearer token).
 * API key auth: sets request.apiKeyId and request.userId (if key is linked to user)
 * JWT auth: sets request.userId
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
      return this.authenticateWithApiKey(request, apiKey);
    }

    // Try JWT Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return this.authenticateWithJwt(request, authHeader.slice(7));
    }

    throw new UnauthorizedException('Missing authentication. Provide X-API-Key header or Bearer token.');
  }

  private async authenticateWithApiKey(request: Record<string, unknown>, apiKey: string): Promise<boolean> {
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
    return true;
  }

  private async authenticateWithJwt(request: Record<string, unknown>, token: string): Promise<boolean> {
    try {
      const secret = this.config.getOrThrow('JWT_SECRET');
      const payload = this.jwt.verify(token, { secret }) as { sub: string; email: string };
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
