import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserAuthService } from '../user-auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockBcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
const mockBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;

// Mock assertPublicUrl from url-validator
jest.mock('../../../common/utils/url-validator', () => ({
  assertPublicUrl: jest.fn(),
}));

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  userSettings: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

describe('UserAuthService', () => {
  let service: UserAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: registration enabled, no approval required (return the caller's fallback).
    mockConfigService.get.mockImplementation((_key: string, def?: unknown) => def);
    service = new UserAuthService(mockPrismaService as any, mockJwtService as any, mockConfigService as any);
  });

  describe('signup', () => {
    const dto = { email: 'user@example.com', password: 'secret123', name: 'Test User' };
    const createdUser = { id: 'user-1', email: dto.email, name: dto.name, role: 'USER', isActive: true };

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockBcryptHash.mockResolvedValue('hashed-password' as never);
      mockPrismaService.user.create.mockResolvedValue(createdUser);
      mockJwtService.sign.mockReturnValue('jwt-token');
    });

    it('throws ForbiddenException when registration is disabled', async () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) =>
        key === 'app.disableRegistration' ? true : def,
      );

      await expect(service.signup(dto)).rejects.toThrow(ForbiddenException);
      await expect(service.signup(dto)).rejects.toThrow('Registration is currently disabled');
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('creates a PENDING user and returns pending status without a token when approval is required', async () => {
      mockConfigService.get.mockImplementation((key: string, def?: unknown) =>
        key === 'app.registrationRequireApproval' ? true : def,
      );
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: dto.name,
        role: 'PENDING',
        isActive: true,
      });

      const result = await service.signup(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'PENDING' }) }),
      );
      expect(result).toMatchObject({ success: true, pending: true });
      expect(result).not.toHaveProperty('token');
      expect(result).not.toHaveProperty('user');
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('creates a USER-role user and issues a token when approval is not required', async () => {
      const result = await service.signup(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'USER' }) }),
      );
      expect(result).toMatchObject({
        success: true,
        user: { id: createdUser.id, email: createdUser.email, role: 'USER', isActive: true },
        token: 'jwt-token',
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({ sub: createdUser.id, email: createdUser.email });
    });

    it('throws ConflictException when email is already registered', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.signup(dto)).rejects.toThrow(ConflictException);
      await expect(service.signup(dto)).rejects.toThrow('Email already registered');
    });

    it('does not create a user when email already exists', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(service.signup(dto)).rejects.toThrow();
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('hashes the password with bcrypt before storing', async () => {
      await service.signup(dto);

      expect(mockBcryptHash).toHaveBeenCalledWith(dto.password, 10);
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'hashed-password' }),
        }),
      );
    });

    it('creates a user with the email and name from the DTO', async () => {
      await service.signup(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: dto.email, name: dto.name }),
        }),
      );
    });

    it('creates default user settings during signup', async () => {
      await service.signup(dto);

      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            settings: { create: {} },
          }),
        }),
      );
    });

    it('returns user details and a JWT token', async () => {
      const result = await service.signup(dto);

      expect(result).toMatchObject({
        user: { id: createdUser.id, email: createdUser.email, name: createdUser.name },
        token: 'jwt-token',
      });
    });

    it('signs JWT with user id and email as payload', async () => {
      await service.signup(dto);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: createdUser.id,
        email: createdUser.email,
      });
    });
  });

  describe('signin', () => {
    const dto = { email: 'user@example.com', password: 'secret123' };
    const existingUser = {
      id: 'user-1',
      email: dto.email,
      name: 'Test User',
      passwordHash: 'hashed-password',
      role: 'USER',
      isActive: true,
    };

    beforeEach(() => {
      mockPrismaService.user.findUnique.mockResolvedValue(existingUser);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockJwtService.sign.mockReturnValue('jwt-token');
    });

    it('throws ForbiddenException for a PENDING account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...existingUser, role: 'PENDING' });

      await expect(service.signin(dto)).rejects.toThrow(ForbiddenException);
      await expect(service.signin(dto)).rejects.toThrow('Account pending admin approval');
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for a deactivated account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...existingUser, isActive: false });

      await expect(service.signin(dto)).rejects.toThrow(ForbiddenException);
      await expect(service.signin(dto)).rejects.toThrow('Account disabled');
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('succeeds for an active ADMIN account', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ ...existingUser, role: 'ADMIN' });

      const result = await service.signin(dto);

      expect(result).toMatchObject({
        success: true,
        user: { id: existingUser.id, email: existingUser.email, role: 'ADMIN', isActive: true },
        token: 'jwt-token',
      });
    });

    it('throws UnauthorizedException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.signin(dto)).rejects.toThrow(UnauthorizedException);
      await expect(service.signin(dto)).rejects.toThrow('Invalid credentials');
    });

    it('throws UnauthorizedException when password does not match', async () => {
      mockBcryptCompare.mockResolvedValue(false as never);

      await expect(service.signin(dto)).rejects.toThrow(UnauthorizedException);
      await expect(service.signin(dto)).rejects.toThrow('Invalid credentials');
    });

    it('compares the provided password against the stored hash', async () => {
      await service.signin(dto);

      expect(mockBcryptCompare).toHaveBeenCalledWith(dto.password, existingUser.passwordHash);
    });

    it('returns user details and a JWT token on success', async () => {
      const result = await service.signin(dto);

      expect(result).toMatchObject({
        user: { id: existingUser.id, email: existingUser.email, name: existingUser.name },
        token: 'jwt-token',
      });
    });

    it('signs JWT with user id and email as payload', async () => {
      await service.signin(dto);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: existingUser.id,
        email: existingUser.email,
      });
    });

    it('does not return the passwordHash in the response', async () => {
      const result = await service.signin(dto);

      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('getProfile', () => {
    const userId = 'user-1';
    const mockUser = {
      id: userId,
      email: 'user@example.com',
      name: 'Test User',
      createdAt: new Date(),
      settings: {},
      _count: { apiKeys: 2, jobs: 10, schedules: 1 },
    };

    it('returns the user profile when found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile(userId);

      expect(result).toEqual(mockUser);
    });

    it('queries by userId', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await service.getProfile(userId);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: userId } }),
      );
    });

    it('includes settings and _count in the query select', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await service.getProfile(userId);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            settings: true,
            _count: expect.any(Object),
          }),
        }),
      );
    });

    it('throws NotFoundException when user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.getProfile('nonexistent')).rejects.toThrow('User not found');
    });
  });

  describe('getSettings', () => {
    const userId = 'user-1';

    it('returns existing settings when found', async () => {
      const existingSettings = {
        userId,
        llmProvider: 'openai',
        llmApiKey: 'sk-12345678abcdef',
        llmModel: 'gpt-4o',
        proxyUrls: [],
      };
      mockPrismaService.userSettings.findUnique.mockResolvedValue(existingSettings);

      const result = await service.getSettings(userId);

      expect(result).toMatchObject({ userId, llmProvider: 'openai' });
    });

    it('masks the llmApiKey to show only first 8 characters', async () => {
      const existingSettings = {
        userId,
        llmApiKey: 'sk-12345678abcdef',
      };
      mockPrismaService.userSettings.findUnique.mockResolvedValue(existingSettings);

      const result = await service.getSettings(userId);

      expect(result.llmApiKey).toBe('sk-12345...');
    });

    it('returns null for llmApiKey when it is not set', async () => {
      const existingSettings = { userId, llmApiKey: null };
      mockPrismaService.userSettings.findUnique.mockResolvedValue(existingSettings);

      const result = await service.getSettings(userId);

      expect(result.llmApiKey).toBeNull();
    });

    it('creates settings when none exist and returns them', async () => {
      const newSettings = { userId, llmApiKey: null };
      mockPrismaService.userSettings.findUnique.mockResolvedValue(null);
      mockPrismaService.userSettings.create.mockResolvedValue(newSettings);

      await service.getSettings(userId);

      expect(mockPrismaService.userSettings.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId } }),
      );
    });

    it('does not create settings when they already exist', async () => {
      mockPrismaService.userSettings.findUnique.mockResolvedValue({ userId, llmApiKey: null });

      await service.getSettings(userId);

      expect(mockPrismaService.userSettings.create).not.toHaveBeenCalled();
    });
  });

  describe('updateSettings', () => {
    const userId = 'user-1';

    it('upserts settings using the userId as the where key', async () => {
      const dto = { llmProvider: 'anthropic', llmModel: 'claude-3-sonnet' };
      mockPrismaService.userSettings.upsert.mockResolvedValue({});

      await service.updateSettings(userId, dto as any);

      expect(mockPrismaService.userSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId } }),
      );
    });

    it('includes only provided fields in the update data', async () => {
      const dto = { llmModel: 'gpt-4o-mini' };
      mockPrismaService.userSettings.upsert.mockResolvedValue({});

      await service.updateSettings(userId, dto as any);

      expect(mockPrismaService.userSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { llmModel: 'gpt-4o-mini' },
        }),
      );
    });

    it('does not include undefined fields in the update data', async () => {
      const dto = { llmProvider: 'openai' };
      mockPrismaService.userSettings.upsert.mockResolvedValue({});

      await service.updateSettings(userId, dto as any);

      const upsertCall = mockPrismaService.userSettings.upsert.mock.calls[0][0];
      expect(upsertCall.update).not.toHaveProperty('llmModel');
      expect(upsertCall.update).not.toHaveProperty('llmApiKey');
    });

    it('returns the result of the upsert', async () => {
      const updatedSettings = { userId, llmProvider: 'anthropic' };
      mockPrismaService.userSettings.upsert.mockResolvedValue(updatedSettings);

      const result = await service.updateSettings(userId, { llmProvider: 'anthropic' } as any);

      expect(result).toEqual(updatedSettings);
    });
  });

  describe('testLlmConnection', () => {
    const { assertPublicUrl } = require('../../../common/utils/url-validator');
    const mockAssertPublicUrl = assertPublicUrl as jest.MockedFunction<typeof assertPublicUrl>;

    const mockFetch = jest.fn();

    beforeEach(() => {
      global.fetch = mockFetch;
      mockAssertPublicUrl.mockResolvedValue(undefined);
    });

    afterEach(() => {
      // Restore
      delete (global as any).fetch;
    });

    it('calls assertPublicUrl before making the fetch request', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      await service.testLlmConnection({ baseUrl: 'https://api.openai.com/v1' });

      expect(mockAssertPublicUrl).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
      );
    });

    it('returns { success: false } when assertPublicUrl throws (private IP)', async () => {
      mockAssertPublicUrl.mockRejectedValue(new Error('Private IP'));

      const result = await service.testLlmConnection({ baseUrl: 'http://192.168.1.1' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('private or blocked');
    });

    it('does not make a fetch request when assertPublicUrl blocks the URL', async () => {
      mockAssertPublicUrl.mockRejectedValue(new Error('Private IP'));

      await service.testLlmConnection({ baseUrl: 'http://192.168.1.1' });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns { success: true } with model response on 200 OK', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      const result = await service.testLlmConnection({ baseUrl: 'https://api.openai.com/v1' });

      expect(result.success).toBe(true);
      expect(result.message).toContain('ok');
    });

    it('includes Authorization header when apiKey is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      await service.testLlmConnection({ baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
        }),
      );
    });

    it('returns { success: false } with status and body on non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      const result = await service.testLlmConnection({ baseUrl: 'https://api.openai.com/v1', apiKey: 'bad-key' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('401');
    });

    it('returns { success: false } with error message when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.testLlmConnection({ baseUrl: 'https://api.openai.com/v1' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('ECONNREFUSED');
    });

    it('prepends http:// when no protocol is specified in baseUrl', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      await service.testLlmConnection({ baseUrl: 'localhost:11434/v1' });

      expect(mockAssertPublicUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^http:\/\//),
      );
    });

    it('uses default OpenAI URL when no baseUrl is provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
      });

      await service.testLlmConnection({});

      expect(mockAssertPublicUrl).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
      );
    });
  });
});
