import { Injectable, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SignupDto, SigninDto, UpdateSettingsDto } from './dto/auth.dto';

@Injectable()
export class UserAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        settings: { create: {} },
      },
    });

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
    };
  }

  async signin(dto: SigninDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwt.sign({ sub: user.id, email: user.email });
    return {
      user: { id: user.id, email: user.email, name: user.name },
      token,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, createdAt: true,
        settings: true,
        _count: { select: { apiKeys: true, jobs: true, schedules: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getSettings(userId: string) {
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });
    if (!settings) {
      settings = await this.prisma.userSettings.create({
        data: { userId },
      });
    }
    // Mask the LLM API key
    return {
      ...settings,
      llmApiKey: settings.llmApiKey ? `${settings.llmApiKey.slice(0, 8)}...` : null,
    };
  }

  async testLlmConnection(opts: { baseUrl?: string; apiKey?: string; model?: string }) {
    let baseUrl = (opts.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = `http://${baseUrl}`;

    const fullUrl = `${baseUrl}/chat/completions`;
    // SSRF protection: block private IPs and metadata endpoints
    const { assertPublicUrl } = await import('../../common/utils/url-validator');
    try {
      await assertPublicUrl(fullUrl);
    } catch {
      return { success: false, message: 'URL resolves to a private or blocked address' };
    }

    try {
      const res = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: opts.model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        const reply = data.choices?.[0]?.message?.content || '';
        return { success: true, message: `Model responded: "${reply.trim()}"` };
      } else {
        const text = await res.text();
        return { success: false, message: `${res.status}: ${text.slice(0, 200)}` };
      }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : 'Connection failed' };
    }
  }

  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const data: Record<string, unknown> = {};
    if (dto.proxyUrls !== undefined) data.proxyUrls = dto.proxyUrls;
    if (dto.llmProvider !== undefined) data.llmProvider = dto.llmProvider;
    if (dto.llmApiKey !== undefined) data.llmApiKey = dto.llmApiKey;
    if (dto.llmModel !== undefined) data.llmModel = dto.llmModel;
    if (dto.llmBaseUrl !== undefined) data.llmBaseUrl = dto.llmBaseUrl;
    if (dto.searxngUrl !== undefined) data.searxngUrl = dto.searxngUrl;

    return this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data } as Parameters<typeof this.prisma.userSettings.create>[0]['data'],
    });
  }
}
