import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { assertPublicUrl } from '../../common/utils/url-validator';
import { ownedWhere } from '../../common/utils/ownership';

type Auth = { userId?: string; apiKeyId?: string };

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private prisma: PrismaService) {}

  async createWebhook(data: { url: string; events: string[]; secret?: string; headers?: Record<string, string> }, auth: Auth = {}) {
    await assertPublicUrl(data.url);
    return this.prisma.webhookConfig.create({
      data: {
        url: data.url,
        events: data.events,
        secret: data.secret,
        headers: data.headers as object,
        userId: auth.userId,
      },
    });
  }

  async listWebhooks(auth: Auth = {}) {
    const where: Record<string, unknown> = { active: true };
    if (auth.userId) where.userId = auth.userId;
    else if (auth.apiKeyId) {
      // For API-key-only callers, show webhooks they created (via userId on the key)
      // If no userId available, return empty — don't expose all webhooks
      return [];
    }
    return this.prisma.webhookConfig.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateWebhook(id: string, data: { url?: string; events?: string[]; secret?: string; active?: boolean }, auth: Auth = {}) {
    const webhook = await this.prisma.webhookConfig.findFirst({
      where: ownedWhere(id, auth),
    });
    if (!webhook) throw new NotFoundException('Webhook not found');

    const updateData: Record<string, unknown> = {};
    if (data.url !== undefined) {
      await assertPublicUrl(data.url);
      updateData.url = data.url;
    }
    if (data.events !== undefined) updateData.events = data.events;
    if (data.secret !== undefined) updateData.secret = data.secret;
    if (data.active !== undefined) updateData.active = data.active;

    return this.prisma.webhookConfig.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteWebhook(id: string, auth: Auth = {}) {
    const webhook = await this.prisma.webhookConfig.findFirst({
      where: ownedWhere(id, auth),
    });
    if (!webhook) throw new NotFoundException('Webhook not found');

    await this.prisma.webhookConfig.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }

  async fireEvent(event: string, jobId: string, data?: unknown) {
    const webhooks = await this.prisma.webhookConfig.findMany({
      where: {
        active: true,
        events: { has: event },
      },
    });

    for (const webhook of webhooks) {
      const payload = {
        event,
        jobId,
        timestamp: new Date().toISOString(),
        data,
      };

      try {
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...((webhook.headers as Record<string, string>) ?? {}),
        };

        if (webhook.secret) {
          const signature = crypto
            .createHmac('sha256', webhook.secret)
            .update(body)
            .digest('hex');
          headers['X-XCrawl-Signature'] = signature;
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(10_000),
        });

        await this.prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            jobId,
            event,
            payload: payload as object,
            statusCode: response.status,
            success: response.ok,
            attempts: 1,
            lastAttempt: new Date(),
          },
        });
      } catch (error) {
        this.logger.warn(`Webhook delivery failed for ${webhook.url}: ${error}`);

        await this.prisma.webhookDelivery.create({
          data: {
            webhookId: webhook.id,
            jobId,
            event,
            payload: payload as object,
            success: false,
            attempts: 1,
            lastAttempt: new Date(),
            response: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  }
}
