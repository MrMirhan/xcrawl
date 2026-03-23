import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthService } from '../auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockBcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;

const mockPrismaService = {
  apiKey: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(mockPrismaService as any);
  });

  describe('createApiKey', () => {
    const createdRecord = {
      id: 'key-id-1',
      name: 'My Key',
      key: 'xc_live',
      createdAt: new Date('2024-01-01'),
    };

    beforeEach(() => {
      mockBcryptHash.mockResolvedValue('hashed-key' as never);
      mockPrismaService.apiKey.create.mockResolvedValue(createdRecord);
    });

    it('creates an API key with the correct name', async () => {
      await service.createApiKey('My Key', 'user-123');

      expect(mockPrismaService.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'My Key' }),
        }),
      );
    });

    it('generates a key with the xc_ prefix', async () => {
      await service.createApiKey('My Key', 'user-123');

      const createCall = mockPrismaService.apiKey.create.mock.calls[0][0];
      // The raw key passed to bcrypt.hash should start with xc_
      expect(mockBcryptHash).toHaveBeenCalledWith(
        expect.stringMatching(/^xc_/),
        10,
      );
      // The first 8 chars of raw key are stored as the prefix
      expect(createCall.data.key).toHaveLength(8);
    });

    it('stores the userId on the API key', async () => {
      await service.createApiKey('My Key', 'user-123');

      expect(mockPrismaService.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-123' }),
        }),
      );
    });

    it('creates an API key without userId when not provided', async () => {
      await service.createApiKey('Anonymous Key');

      expect(mockPrismaService.apiKey.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: undefined }),
        }),
      );
    });

    it('returns the raw key only once at creation', async () => {
      const result = await service.createApiKey('My Key', 'user-123');

      expect(result).toHaveProperty('key');
      expect(typeof result.key).toBe('string');
      expect(result.key).toMatch(/^xc_/);
    });

    it('returns id, name, key, and createdAt in the response', async () => {
      const result = await service.createApiKey('My Key', 'user-123');

      expect(result).toMatchObject({
        id: createdRecord.id,
        name: createdRecord.name,
        createdAt: createdRecord.createdAt,
      });
      expect(result).toHaveProperty('key');
    });

    it('hashes the raw key with bcrypt before storing', async () => {
      await service.createApiKey('My Key', 'user-123');

      expect(mockBcryptHash).toHaveBeenCalledWith(expect.any(String), 10);

      const createCall = mockPrismaService.apiKey.create.mock.calls[0][0];
      expect(createCall.data.hashedKey).toBe('hashed-key');
    });

    it('generates a unique key each call', async () => {
      const rawKeys: string[] = [];
      mockBcryptHash.mockImplementation(async (key: string) => {
        rawKeys.push(key);
        return 'hashed';
      });
      mockPrismaService.apiKey.create.mockResolvedValue(createdRecord);

      await service.createApiKey('Key 1', 'user-123');
      await service.createApiKey('Key 2', 'user-123');

      expect(rawKeys[0]).not.toBe(rawKeys[1]);
    });
  });

  describe('listApiKeys', () => {
    const mockKeys = [
      { id: 'k1', name: 'Key 1', key: 'xc_live1', lastUsed: null, active: true, createdAt: new Date() },
      { id: 'k2', name: 'Key 2', key: 'xc_test2', lastUsed: new Date(), active: true, createdAt: new Date() },
    ];

    beforeEach(() => {
      mockPrismaService.apiKey.findMany.mockResolvedValue(mockKeys);
    });

    it('scopes query by userId when provided', async () => {
      await service.listApiKeys('user-123');

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123' },
        }),
      );
    });

    it('fetches all keys when no userId provided', async () => {
      await service.listApiKeys();

      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: undefined,
        }),
      );
    });

    it('masks the key by appending ... to the prefix', async () => {
      const result = await service.listApiKeys('user-123');

      result.forEach((key: { key: string }) => {
        expect(key.key).toMatch(/\.\.\.$/);
      });
    });

    it('masks "xc_live1" as "xc_live1..."', async () => {
      const result = await service.listApiKeys('user-123');
      expect(result[0].key).toBe('xc_live1...');
    });

    it('does not expose the raw full key', async () => {
      const result = await service.listApiKeys('user-123');

      result.forEach((key: { key: string }) => {
        // Raw key would be much longer — masked key should end with ...
        expect(key.key).toMatch(/\.\.\.$/);
      });
    });

    it('returns the correct fields for each key', async () => {
      const result = await service.listApiKeys('user-123');

      result.forEach((key: Record<string, unknown>) => {
        expect(key).toHaveProperty('id');
        expect(key).toHaveProperty('name');
        expect(key).toHaveProperty('key');
        expect(key).toHaveProperty('lastUsed');
        expect(key).toHaveProperty('active');
        expect(key).toHaveProperty('createdAt');
      });
    });
  });

  describe('revokeApiKey', () => {
    const existingKey = {
      id: 'key-id-1',
      name: 'My Key',
      userId: 'user-123',
      active: true,
    };

    it('revokes the API key when ownership is confirmed', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(existingKey);
      mockPrismaService.apiKey.update.mockResolvedValue({ ...existingKey, active: false });

      const result = await service.revokeApiKey('key-id-1', 'user-123');

      expect(result).toEqual({ success: true });
    });

    it('sets active to false on revocation', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(existingKey);
      mockPrismaService.apiKey.update.mockResolvedValue({ ...existingKey, active: false });

      await service.revokeApiKey('key-id-1', 'user-123');

      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-id-1' },
        data: { active: false },
      });
    });

    it('throws NotFoundException when API key does not exist', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue(null);

      await expect(service.revokeApiKey('nonexistent', 'user-123')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.revokeApiKey('nonexistent', 'user-123')).rejects.toThrow(
        'API key not found',
      );
    });

    it('throws ForbiddenException when key belongs to different user', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        ...existingKey,
        userId: 'other-user',
      });

      await expect(service.revokeApiKey('key-id-1', 'user-123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException with descriptive message', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        ...existingKey,
        userId: 'other-user',
      });

      await expect(service.revokeApiKey('key-id-1', 'user-123')).rejects.toThrow(
        'does not belong to this user',
      );
    });

    it('does not update the key when ownership check fails', async () => {
      mockPrismaService.apiKey.findUnique.mockResolvedValue({
        ...existingKey,
        userId: 'other-user',
      });

      await expect(service.revokeApiKey('key-id-1', 'user-123')).rejects.toThrow();
      expect(mockPrismaService.apiKey.update).not.toHaveBeenCalled();
    });
  });
});
