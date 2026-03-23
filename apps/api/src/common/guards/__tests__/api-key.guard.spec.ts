import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { ApiKeyGuard } from '../api-key.guard';

// Mock bcrypt before any imports resolve it
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

import * as bcrypt from 'bcrypt';

const mockBcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;

// Minimal PrismaService mock shape
const mockPrismaService = {
  apiKey: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockJwtService = {
  verify: jest.fn(),
};

const mockConfigService = {
  getOrThrow: jest.fn(),
};

function buildContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ApiKeyGuard(
      mockPrismaService as any,
      mockJwtService as any,
      mockConfigService as any,
    );
  });

  describe('when no authentication header is provided', () => {
    it('throws UnauthorizedException', async () => {
      const ctx = buildContext({});
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('throws with message about missing authentication', async () => {
      const ctx = buildContext({});
      await expect(guard.canActivate(ctx)).rejects.toThrow('Missing authentication');
    });
  });

  describe('API key authentication via X-API-Key header', () => {
    const rawKey = 'xc_live12345678abcdefghijklmnop';
    const prefix = rawKey.slice(0, 8);

    const candidateKey = {
      id: 'key-id-1',
      key: prefix,
      hashedKey: 'hashed-value',
      active: true,
      userId: 'user-id-1',
    };

    it('authenticates successfully with a valid API key', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([candidateKey]);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockPrismaService.apiKey.update.mockResolvedValue({});

      const request: Record<string, unknown> = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(request.apiKeyId).toBe(candidateKey.id);
      expect(request.userId).toBe(candidateKey.userId);
    });

    it('sets request.apiKeyId correctly', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([candidateKey]);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockPrismaService.apiKey.update.mockResolvedValue({});

      const request: Record<string, unknown> = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);
      expect(request.apiKeyId).toBe('key-id-1');
    });

    it('sets request.userId from the linked API key', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([candidateKey]);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockPrismaService.apiKey.update.mockResolvedValue({});

      const request: Record<string, unknown> = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);
      expect(request.userId).toBe('user-id-1');
    });

    it('sets request.userId to undefined when API key has no linked user', async () => {
      const keyWithoutUser = { ...candidateKey, userId: null };
      mockPrismaService.apiKey.findMany.mockResolvedValue([keyWithoutUser]);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockPrismaService.apiKey.update.mockResolvedValue({});

      const request: Record<string, unknown> = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);
      expect(request.userId).toBeUndefined();
    });

    it('updates lastUsed timestamp on successful authentication', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([candidateKey]);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockPrismaService.apiKey.update.mockResolvedValue({});

      const request: Record<string, unknown> = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);

      expect(mockPrismaService.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: candidateKey.id },
          data: expect.objectContaining({ lastUsed: expect.any(Date) }),
        }),
      );
    });

    it('throws UnauthorizedException when bcrypt compare fails (wrong key)', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([candidateKey]);
      mockBcryptCompare.mockResolvedValue(false as never);

      const ctx = buildContext({ 'x-api-key': rawKey });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid API key');
    });

    it('throws UnauthorizedException when no candidate keys match the prefix', async () => {
      mockPrismaService.apiKey.findMany.mockResolvedValue([]);

      const ctx = buildContext({ 'x-api-key': rawKey });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('tries all candidates and picks the matching one', async () => {
      const wrongCandidate = { ...candidateKey, id: 'key-id-wrong', hashedKey: 'other-hash' };
      const rightCandidate = { ...candidateKey, id: 'key-id-right' };

      mockPrismaService.apiKey.findMany.mockResolvedValue([wrongCandidate, rightCandidate]);
      // First compare returns false, second returns true
      mockBcryptCompare
        .mockResolvedValueOnce(false as never)
        .mockResolvedValueOnce(true as never);
      mockPrismaService.apiKey.update.mockResolvedValue({});

      const request: Record<string, unknown> = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);
      expect(request.apiKeyId).toBe('key-id-right');
    });
  });

  describe('JWT Bearer token authentication', () => {
    const token = 'valid.jwt.token';
    const jwtSecret = 'test-secret';

    beforeEach(() => {
      mockConfigService.getOrThrow.mockReturnValue(jwtSecret);
    });

    it('authenticates successfully with a valid JWT token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-123', email: 'user@example.com' });

      const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      const result = await guard.canActivate(ctx);
      expect(result).toBe(true);
    });

    it('sets request.userId from JWT sub claim', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-abc', email: 'test@example.com' });

      const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);
      expect(request.userId).toBe('user-abc');
    });

    it('calls jwt.verify with the JWT_SECRET from config', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-123', email: 'user@example.com' });

      const ctx = buildContext({ authorization: `Bearer ${token}` });
      await guard.canActivate(ctx);

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
      expect(mockJwtService.verify).toHaveBeenCalledWith(token, { secret: jwtSecret });
    });

    it('throws UnauthorizedException when JWT is expired or invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      const ctx = buildContext({ authorization: `Bearer expired.token.here` });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(ctx)).rejects.toThrow('Invalid or expired token');
    });

    it('throws UnauthorizedException when JWT signature is invalid', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const ctx = buildContext({ authorization: `Bearer tampered.token` });
      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('does not call PrismaService for JWT authentication', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-123', email: 'user@example.com' });

      const ctx = buildContext({ authorization: `Bearer ${token}` });
      await guard.canActivate(ctx);

      expect(mockPrismaService.apiKey.findMany).not.toHaveBeenCalled();
    });
  });

  describe('auth precedence', () => {
    it('prefers X-API-Key over Authorization Bearer when both are present', async () => {
      const rawKey = 'xc_live12345678abcdefghijklmnop';
      const candidateKey = {
        id: 'key-id-1',
        key: rawKey.slice(0, 8),
        hashedKey: 'hashed',
        active: true,
        userId: 'user-from-key',
      };

      mockPrismaService.apiKey.findMany.mockResolvedValue([candidateKey]);
      mockBcryptCompare.mockResolvedValue(true as never);
      mockPrismaService.apiKey.update.mockResolvedValue({});

      const request: Record<string, unknown> = {
        headers: {
          'x-api-key': rawKey,
          authorization: 'Bearer some.jwt.token',
        },
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await guard.canActivate(ctx);

      // Should have used API key path, not JWT
      expect(mockPrismaService.apiKey.findMany).toHaveBeenCalled();
      expect(mockJwtService.verify).not.toHaveBeenCalled();
      expect(request.apiKeyId).toBe('key-id-1');
    });
  });
});
