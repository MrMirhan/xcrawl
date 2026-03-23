import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ScheduleService } from '../schedule.service';

// Mock assertPublicUrl so tests don't do real DNS lookups
jest.mock('../../../common/utils/url-validator', () => ({
  assertPublicUrl: jest.fn(),
}));

import { assertPublicUrl } from '../../../common/utils/url-validator';

const mockAssertPublicUrl = assertPublicUrl as jest.MockedFunction<typeof assertPublicUrl>;

const mockPrismaService = {
  schedule: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  job: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockScrapeQueue = {
  add: jest.fn(),
};

const mockCrawlQueue = {
  add: jest.fn(),
};

describe('ScheduleService', () => {
  let service: ScheduleService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssertPublicUrl.mockResolvedValue(undefined);
    service = new ScheduleService(
      mockPrismaService as any,
      mockScrapeQueue as any,
      mockCrawlQueue as any,
    );
  });

  describe('create', () => {
    const validDto = {
      name: 'Daily Scrape',
      type: 'SCRAPE',
      cron: '0 0 * * *',
      config: { url: 'https://example.com' },
    };

    const createdSchedule = {
      id: 'sched-1',
      ...validDto,
      active: true,
      nextRunAt: new Date(),
      userId: 'user-123',
    };

    beforeEach(() => {
      mockPrismaService.schedule.create.mockResolvedValue(createdSchedule);
    });

    it('creates a schedule with valid cron expression', async () => {
      const result = await service.create(validDto, { userId: 'user-123' });
      expect(result).toEqual(createdSchedule);
    });

    it('stores the userId from auth', async () => {
      await service.create(validDto, { userId: 'user-123' });

      expect(mockPrismaService.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-123' }),
        }),
      );
    });

    it('stores name, type, cron, and config', async () => {
      await service.create(validDto, { userId: 'user-123' });

      expect(mockPrismaService.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: validDto.name,
            type: validDto.type,
            cron: validDto.cron,
            config: validDto.config,
          }),
        }),
      );
    });

    it('throws BadRequestException for invalid cron expression', async () => {
      const invalidDto = { ...validDto, cron: 'not-a-cron' };

      await expect(service.create(invalidDto, { userId: 'user-123' })).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(invalidDto, { userId: 'user-123' })).rejects.toThrow(
        'Invalid cron expression',
      );
    });

    it('does not create schedule when cron is invalid', async () => {
      const invalidDto = { ...validDto, cron: '99 99 99 99 99' };

      await expect(service.create(invalidDto, { userId: 'user-123' })).rejects.toThrow();
      expect(mockPrismaService.schedule.create).not.toHaveBeenCalled();
    });

    it('calls assertPublicUrl on webhookUrl when provided', async () => {
      const dtoWithWebhook = { ...validDto, webhookUrl: 'https://hooks.example.com' };
      await service.create(dtoWithWebhook, { userId: 'user-123' });

      expect(mockAssertPublicUrl).toHaveBeenCalledWith('https://hooks.example.com');
    });

    it('does not call assertPublicUrl when webhookUrl is not provided', async () => {
      await service.create(validDto, { userId: 'user-123' });
      expect(mockAssertPublicUrl).not.toHaveBeenCalled();
    });

    it('rejects when webhookUrl resolves to a private address', async () => {
      mockAssertPublicUrl.mockRejectedValue(
        new BadRequestException('URL resolves to a private IP address'),
      );
      const dtoWithBadHook = { ...validDto, webhookUrl: 'https://internal.evil.com' };

      await expect(service.create(dtoWithBadHook, { userId: 'user-123' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrismaService.schedule.create).not.toHaveBeenCalled();
    });

    it('calculates nextRunAt from cron expression', async () => {
      await service.create(validDto, { userId: 'user-123' });

      const createCall = mockPrismaService.schedule.create.mock.calls[0][0];
      expect(createCall.data.nextRunAt).toBeInstanceOf(Date);
    });

    it('defaults enableChangeDetection to false', async () => {
      await service.create(validDto, { userId: 'user-123' });

      expect(mockPrismaService.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ enableChangeDetection: false }),
        }),
      );
    });

    it('accepts valid 5-field cron expressions', async () => {
      const dto = { ...validDto, cron: '*/5 * * * *' }; // every 5 minutes
      await expect(service.create(dto, { userId: 'user-123' })).resolves.toBeDefined();
    });

    it('accepts valid 6-field cron expressions (with seconds)', async () => {
      const dto = { ...validDto, cron: '0 */5 * * * *' }; // every 5 minutes with seconds
      await expect(service.create(dto, { userId: 'user-123' })).resolves.toBeDefined();
    });
  });

  describe('get', () => {
    const mockSchedule = {
      id: 'sched-1',
      name: 'Daily',
      cron: '0 0 * * *',
      userId: 'user-123',
    };

    it('finds schedule using ownedWhere with userId', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(mockSchedule);

      await service.get('sched-1', { userId: 'user-123' });

      expect(mockPrismaService.schedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1', userId: 'user-123' },
        }),
      );
    });

    it('finds schedule using ownedWhere with apiKeyId', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(mockSchedule);

      await service.get('sched-1', { apiKeyId: 'key-abc' });

      expect(mockPrismaService.schedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1', apiKeyId: 'key-abc' },
        }),
      );
    });

    it('returns the schedule when found', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(mockSchedule);

      const result = await service.get('sched-1', { userId: 'user-123' });
      expect(result).toEqual(mockSchedule);
    });

    it('throws NotFoundException when schedule does not exist', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(null);

      await expect(service.get('nonexistent', { userId: 'user-123' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.get('nonexistent', { userId: 'user-123' })).rejects.toThrow(
        'Schedule not found',
      );
    });

    it('throws UnauthorizedException when no auth provided', async () => {
      await expect(service.get('sched-1', {})).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('update', () => {
    const existingSchedule = {
      id: 'sched-1',
      name: 'Daily',
      cron: '0 0 * * *',
      userId: 'user-123',
      active: true,
    };

    beforeEach(() => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockPrismaService.schedule.update.mockResolvedValue(existingSchedule);
    });

    it('validates new cron when cron is being updated', async () => {
      await service.update('sched-1', { cron: '*/30 * * * *' }, { userId: 'user-123' });

      expect(mockPrismaService.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cron: '*/30 * * * *' }),
        }),
      );
    });

    it('throws BadRequestException when updated cron is invalid', async () => {
      await expect(
        service.update('sched-1', { cron: 'bad-cron' }, { userId: 'user-123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not validate cron when cron is not in update data', async () => {
      await expect(
        service.update('sched-1', { name: 'New Name' }, { userId: 'user-123' }),
      ).resolves.toBeDefined();
    });

    it('recalculates nextRunAt when cron changes', async () => {
      await service.update('sched-1', { cron: '*/30 * * * *' }, { userId: 'user-123' });

      expect(mockPrismaService.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nextRunAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws NotFoundException when schedule not found', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(null);

      await expect(
        service.update('sched-1', { name: 'New Name' }, { userId: 'user-123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses ownedWhere for ownership check', async () => {
      await service.update('sched-1', { name: 'New Name' }, { userId: 'user-123' });

      expect(mockPrismaService.schedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1', userId: 'user-123' },
        }),
      );
    });
  });

  describe('toggle', () => {
    it('uses ownedWhere for ownership check', async () => {
      const schedule = { id: 'sched-1', active: true, cron: '0 0 * * *' };
      mockPrismaService.schedule.findFirst.mockResolvedValue(schedule);
      mockPrismaService.schedule.update.mockResolvedValue({ ...schedule, active: false });

      await service.toggle('sched-1', { userId: 'user-123' });

      expect(mockPrismaService.schedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1', userId: 'user-123' },
        }),
      );
    });

    it('deactivates an active schedule', async () => {
      const schedule = { id: 'sched-1', active: true, cron: '0 0 * * *' };
      mockPrismaService.schedule.findFirst.mockResolvedValue(schedule);
      mockPrismaService.schedule.update.mockResolvedValue({ ...schedule, active: false });

      await service.toggle('sched-1', { userId: 'user-123' });

      expect(mockPrismaService.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('activates an inactive schedule', async () => {
      const schedule = { id: 'sched-1', active: false, cron: '0 0 * * *' };
      mockPrismaService.schedule.findFirst.mockResolvedValue(schedule);
      mockPrismaService.schedule.update.mockResolvedValue({ ...schedule, active: true });

      await service.toggle('sched-1', { userId: 'user-123' });

      expect(mockPrismaService.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ active: true }),
        }),
      );
    });

    it('throws NotFoundException when schedule not found', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(null);

      await expect(service.toggle('sched-1', { userId: 'user-123' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws UnauthorizedException when no auth provided', async () => {
      await expect(service.toggle('sched-1', {})).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('remove', () => {
    const existingSchedule = { id: 'sched-1', name: 'Daily', userId: 'user-123' };

    beforeEach(() => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockPrismaService.schedule.delete.mockResolvedValue(existingSchedule);
    });

    it('uses ownedWhere for ownership check', async () => {
      await service.remove('sched-1', { userId: 'user-123' });

      expect(mockPrismaService.schedule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1', userId: 'user-123' },
        }),
      );
    });

    it('deletes the schedule record', async () => {
      await service.remove('sched-1', { userId: 'user-123' });

      expect(mockPrismaService.schedule.delete).toHaveBeenCalledWith({
        where: { id: 'sched-1' },
      });
    });

    it('returns success true after deletion', async () => {
      const result = await service.remove('sched-1', { userId: 'user-123' });
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when schedule not found', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(null);

      await expect(service.remove('sched-1', { userId: 'user-123' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not delete when schedule not found', async () => {
      mockPrismaService.schedule.findFirst.mockResolvedValue(null);

      await expect(service.remove('sched-1', { userId: 'user-123' })).rejects.toThrow();
      expect(mockPrismaService.schedule.delete).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when no auth provided', async () => {
      await expect(service.remove('sched-1', {})).rejects.toThrow(UnauthorizedException);
    });
  });
});
