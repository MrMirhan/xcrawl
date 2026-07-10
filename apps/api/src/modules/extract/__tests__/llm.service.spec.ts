import { ForbiddenException } from '@nestjs/common';
import { LlmService } from '../llm.service';

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: string) => defaultVal ?? ''),
};

const mockPrismaService = {
  userSettings: {
    findUnique: jest.fn(),
  },
};

const mockUsageService = {
  getEffectiveLimits: jest.fn(),
};

describe('LlmService', () => {
  let service: LlmService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LlmService(
      mockConfigService as any,
      mockPrismaService as any,
      mockUsageService as any,
    );
  });

  describe('BYOK gate', () => {
    it('throws ForbiddenException when canUseOwnLlm is false, before reading UserSettings', async () => {
      mockUsageService.getEffectiveLimits.mockResolvedValue({ canUseOwnLlm: false });

      await expect(
        service.extract('content', { userId: 'user-1', prompt: 'extract' }),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.extract('content', { userId: 'user-1', prompt: 'extract' }),
      ).rejects.toThrow('Your plan does not include LLM/extract access');

      expect(mockUsageService.getEffectiveLimits).toHaveBeenCalledWith('user-1');
      expect(mockPrismaService.userSettings.findUnique).not.toHaveBeenCalled();
    });

    it('proceeds to read UserSettings when canUseOwnLlm is true', async () => {
      mockUsageService.getEffectiveLimits.mockResolvedValue({ canUseOwnLlm: true });
      mockPrismaService.userSettings.findUnique.mockResolvedValue(null);
      // No env API key and no user key → extract returns null without fetching
      mockConfigService.get.mockImplementation((key: string, defaultVal?: string) =>
        key === 'LLM_API_KEY' ? defaultVal ?? '' : defaultVal ?? '',
      );

      const result = await service.extract('content', { userId: 'user-1' });

      expect(mockUsageService.getEffectiveLimits).toHaveBeenCalledWith('user-1');
      expect(mockPrismaService.userSettings.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(result).toBeNull();
    });

    it('skips the gate when no userId is provided (anonymous fallback)', async () => {
      const result = await service.extract('content', {});

      expect(mockUsageService.getEffectiveLimits).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });
});