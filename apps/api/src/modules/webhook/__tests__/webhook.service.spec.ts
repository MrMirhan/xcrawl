import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { WebhookService } from '../webhook.service';

// Mock assertPublicUrl so tests don't perform real DNS lookups
jest.mock('../../../common/utils/url-validator', () => ({
  assertPublicUrl: jest.fn(),
}));

import { assertPublicUrl } from '../../../common/utils/url-validator';

const mockAssertPublicUrl = assertPublicUrl as jest.MockedFunction<typeof assertPublicUrl>;

const mockPrismaService = {
  webhookConfig: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertPublicUrl.mockResolvedValue(undefined);
    service = new WebhookService(mockPrismaService as any);
  });

  describe('createWebhook', () => {
    const webhookData = {
      url: 'https://example.com/webhook',
      events: ['job.completed'],
      secret: 'my-secret',
    };

    const createdWebhook = {
      id: 'wh-1',
      url: webhookData.url,
      events: webhookData.events,
      userId: 'user-123',
      active: true,
    };

    beforeEach(() => {
      mockPrismaService.webhookConfig.create.mockResolvedValue(createdWebhook);
    });

    it('calls assertPublicUrl before creating the webhook', async () => {
      await service.createWebhook(webhookData, { userId: 'user-123' });

      expect(mockAssertPublicUrl).toHaveBeenCalledWith(webhookData.url);
      expect(mockPrismaService.webhookConfig.create).toHaveBeenCalled();
    });

    it('does not create webhook when assertPublicUrl throws', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockAssertPublicUrl.mockRejectedValue(
        new BadRequestException('Access to private IP addresses is not allowed'),
      );

      await expect(
        service.createWebhook({ url: 'http://192.168.1.1', events: [] }, { userId: 'user-123' }),
      ).rejects.toThrow();

      expect(mockPrismaService.webhookConfig.create).not.toHaveBeenCalled();
    });

    it('creates the webhook with the provided url and events', async () => {
      await service.createWebhook(webhookData, { userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: webhookData.url,
            events: webhookData.events,
          }),
        }),
      );
    });

    it('stores the userId from auth on the webhook', async () => {
      await service.createWebhook(webhookData, { userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-123' }),
        }),
      );
    });

    it('creates the webhook even for API key callers (userId may be undefined)', async () => {
      await service.createWebhook(webhookData, { apiKeyId: 'key-abc' });

      expect(mockPrismaService.webhookConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: undefined }),
        }),
      );
    });

    it('returns the created webhook', async () => {
      const result = await service.createWebhook(webhookData, { userId: 'user-123' });
      expect(result).toEqual(createdWebhook);
    });

    it('stores the optional secret', async () => {
      await service.createWebhook(webhookData, { userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ secret: 'my-secret' }),
        }),
      );
    });
  });

  describe('listWebhooks', () => {
    const mockWebhooks = [
      { id: 'wh-1', url: 'https://a.com', active: true, userId: 'user-123' },
      { id: 'wh-2', url: 'https://b.com', active: true, userId: 'user-123' },
    ];

    beforeEach(() => {
      mockPrismaService.webhookConfig.findMany.mockResolvedValue(mockWebhooks);
    });

    it('filters by userId when userId is provided', async () => {
      await service.listWebhooks({ userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-123' }),
        }),
      );
    });

    it('returns empty array for API-key-only callers without a userId', async () => {
      const result = await service.listWebhooks({ apiKeyId: 'key-abc' });

      expect(result).toEqual([]);
      expect(mockPrismaService.webhookConfig.findMany).not.toHaveBeenCalled();
    });

    it('only returns active webhooks', async () => {
      await service.listWebhooks({ userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('returns webhooks ordered by createdAt descending', async () => {
      await service.listWebhooks({ userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('updateWebhook', () => {
    const existingWebhook = {
      id: 'wh-1',
      url: 'https://old.com/webhook',
      events: ['job.completed'],
      userId: 'user-123',
      active: true,
    };

    const updatedWebhook = { ...existingWebhook, url: 'https://new.com/webhook' };

    beforeEach(() => {
      mockPrismaService.webhookConfig.findFirst.mockResolvedValue(existingWebhook);
      mockPrismaService.webhookConfig.update.mockResolvedValue(updatedWebhook);
    });

    it('uses ownedWhere to find the webhook by userId', async () => {
      await service.updateWebhook('wh-1', { url: 'https://new.com' }, { userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1', userId: 'user-123' },
        }),
      );
    });

    it('uses ownedWhere to find the webhook by apiKeyId', async () => {
      await service.updateWebhook('wh-1', { url: 'https://new.com' }, { apiKeyId: 'key-abc' });

      expect(mockPrismaService.webhookConfig.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1', apiKeyId: 'key-abc' },
        }),
      );
    });

    it('throws NotFoundException when webhook not found', async () => {
      mockPrismaService.webhookConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.updateWebhook('wh-1', { url: 'https://new.com' }, { userId: 'user-123' }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.updateWebhook('wh-1', { url: 'https://new.com' }, { userId: 'user-123' }),
      ).rejects.toThrow('Webhook not found');
    });

    it('calls assertPublicUrl when URL is being changed', async () => {
      await service.updateWebhook(
        'wh-1',
        { url: 'https://new.com/webhook' },
        { userId: 'user-123' },
      );

      expect(mockAssertPublicUrl).toHaveBeenCalledWith('https://new.com/webhook');
    });

    it('does not call assertPublicUrl when URL is not in the update data', async () => {
      await service.updateWebhook('wh-1', { events: ['job.failed'] }, { userId: 'user-123' });

      expect(mockAssertPublicUrl).not.toHaveBeenCalled();
    });

    it('rejects update when new URL resolves to private address', async () => {
      const { BadRequestException } = await import('@nestjs/common');
      mockAssertPublicUrl.mockRejectedValue(
        new BadRequestException('URL resolves to a private IP address'),
      );

      await expect(
        service.updateWebhook(
          'wh-1',
          { url: 'http://internal.evil.com' },
          { userId: 'user-123' },
        ),
      ).rejects.toThrow();

      expect(mockPrismaService.webhookConfig.update).not.toHaveBeenCalled();
    });

    it('updates events without touching url', async () => {
      await service.updateWebhook(
        'wh-1',
        { events: ['job.failed', 'job.completed'] },
        { userId: 'user-123' },
      );

      expect(mockPrismaService.webhookConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1' },
          data: { events: ['job.failed', 'job.completed'] },
        }),
      );
    });

    it('can toggle active status', async () => {
      await service.updateWebhook('wh-1', { active: false }, { userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('throws UnauthorizedException when no auth provided', async () => {
      await expect(service.updateWebhook('wh-1', {}, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('deleteWebhook', () => {
    const existingWebhook = {
      id: 'wh-1',
      url: 'https://example.com/hook',
      userId: 'user-123',
      active: true,
    };

    beforeEach(() => {
      mockPrismaService.webhookConfig.findFirst.mockResolvedValue(existingWebhook);
      mockPrismaService.webhookConfig.update.mockResolvedValue({ ...existingWebhook, active: false });
    });

    it('uses ownedWhere to verify ownership', async () => {
      await service.deleteWebhook('wh-1', { userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'wh-1', userId: 'user-123' },
        }),
      );
    });

    it('soft-deletes by setting active to false', async () => {
      await service.deleteWebhook('wh-1', { userId: 'user-123' });

      expect(mockPrismaService.webhookConfig.update).toHaveBeenCalledWith({
        where: { id: 'wh-1' },
        data: { active: false },
      });
    });

    it('returns success true after deletion', async () => {
      const result = await service.deleteWebhook('wh-1', { userId: 'user-123' });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when webhook does not exist', async () => {
      mockPrismaService.webhookConfig.findFirst.mockResolvedValue(null);

      await expect(service.deleteWebhook('wh-1', { userId: 'user-123' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.deleteWebhook('wh-1', { userId: 'user-123' })).rejects.toThrow(
        'Webhook not found',
      );
    });

    it('does not update when webhook not found', async () => {
      mockPrismaService.webhookConfig.findFirst.mockResolvedValue(null);

      await expect(service.deleteWebhook('wh-1', { userId: 'user-123' })).rejects.toThrow();
      expect(mockPrismaService.webhookConfig.update).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when no auth provided', async () => {
      await expect(service.deleteWebhook('wh-1', {})).rejects.toThrow(UnauthorizedException);
    });
  });
});
