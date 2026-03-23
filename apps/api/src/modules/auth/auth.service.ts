import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async createApiKey(name: string, userId?: string) {
    const rawKey = `xc_${crypto.randomBytes(24).toString('hex')}`;
    const hashedKey = await bcrypt.hash(rawKey, 10);

    const apiKey = await this.prisma.apiKey.create({
      data: { name, key: rawKey.slice(0, 8), hashedKey, userId },
    });

    return {
      id: apiKey.id,
      name: apiKey.name,
      key: rawKey, // Only shown once at creation
      createdAt: apiKey.createdAt,
    };
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
