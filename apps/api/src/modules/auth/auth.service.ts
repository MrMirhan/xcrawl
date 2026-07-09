import { Injectable, ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@xcrawl/db';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const MAX_KEY_CREATE_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async createApiKey(name: string, userId?: string) {
    for (let attempt = 1; attempt <= MAX_KEY_CREATE_ATTEMPTS; attempt++) {
      const rawKey = `xc_${crypto.randomBytes(24).toString('hex')}`;
      const hashedKey = await bcrypt.hash(rawKey, 10);

      try {
        const apiKey = await this.prisma.apiKey.create({
          data: { name, key: rawKey.slice(0, 8), hashedKey, userId },
        });

        return {
          id: apiKey.id,
          name: apiKey.name,
          key: rawKey, // Only shown once at creation
          createdAt: apiKey.createdAt,
        };
      } catch (error) {
        // Prefix is 8 chars (xc_ + 5 hex) — collisions are expected at scale, retry with a fresh key
        const isPrefixCollision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isPrefixCollision) throw error;
      }
    }

    throw new ConflictException('Could not generate a unique API key, please try again');
  }

  async listApiKeys(userId?: string) {
    return this.prisma.apiKey.findMany({
      where: userId ? { userId } : undefined,
      select: {
        id: true,
        name: true,
        key: true,
        lastUsed: true,
        active: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }).then((keys: { id: string; name: string; key: string; lastUsed: Date | null; active: boolean; createdAt: Date }[]) => keys.map((k) => ({
      ...k,
      key: `${k.key}...`,
    })));
  }

  async revokeApiKey(id: string, userId: string) {
    const apiKey = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!apiKey) throw new NotFoundException('API key not found');
    if (apiKey.userId !== userId) throw new ForbiddenException('API key does not belong to this user');

    await this.prisma.apiKey.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }
}
