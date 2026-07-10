import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlansService } from '../plans.service';

const mockPrismaService = {
  plan: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

describe('PlansService', () => {
  let service: PlansService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlansService(mockPrismaService as any);
  });

  const basePlan = {
    id: 'plan-1',
    name: 'Free',
    description: 'Free plan',
    isDefault: true,
    dailyPageLimit: 100,
    weeklyPageLimit: 500,
    dailySearchLimit: 50,
    weeklySearchLimit: 200,
    dailyExtractLimit: 30,
    weeklyExtractLimit: 100,
    canUseOwnLlm: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('list', () => {
    it('returns plans with assignedUsers count', async () => {
      mockPrismaService.plan.findMany.mockResolvedValue([
        { ...basePlan, _count: { users: 5 } },
        { ...basePlan, id: 'plan-2', name: 'Pro', _count: { users: 0 } },
      ]);

      const result = await service.list();
      expect(result).toHaveLength(2);
      expect(result[0].assignedUsers).toBe(5);
      expect(result[1].assignedUsers).toBe(0);
    });
  });

  describe('create', () => {
    it('first-ever plan becomes default even without isDefault in body', async () => {
      mockPrismaService.plan.count.mockResolvedValue(0);
      mockPrismaService.plan.create.mockResolvedValue({ ...basePlan, isDefault: true });

      const result = await service.create({
        name: 'Free',
        description: 'Free plan',
        canUseOwnLlm: false,
      });

      expect(result.isDefault).toBe(true);
      expect(mockPrismaService.plan.create).toHaveBeenCalledWith({
        data: {
          name: 'Free',
          description: 'Free plan',
          canUseOwnLlm: false,
          isDefault: true,
        },
      });
    });

    it('second plan with isDefault:true unsets the previous default', async () => {
      mockPrismaService.plan.count.mockResolvedValue(1);
      mockPrismaService.plan.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.plan.create.mockResolvedValue({ ...basePlan, id: 'plan-2', name: 'Pro', isDefault: true });

      const result = await service.create({
        name: 'Pro',
        description: 'Pro plan',
        canUseOwnLlm: true,
        isDefault: true,
      });

      expect(result.isDefault).toBe(true);
      expect(mockPrismaService.plan.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    });

    it('second plan without isDefault leaves existing default untouched', async () => {
      mockPrismaService.plan.count.mockResolvedValue(1);
      mockPrismaService.plan.create.mockResolvedValue({ ...basePlan, id: 'plan-2', name: 'Pro', isDefault: false });

      const result = await service.create({
        name: 'Pro',
        description: 'Pro plan',
        canUseOwnLlm: true,
      });

      expect(result.isDefault).toBe(false);
      expect(mockPrismaService.plan.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('throws NotFoundException for missing plan', async () => {
      mockPrismaService.plan.findUnique.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('updates plan without touching default when isDefault not provided', async () => {
      mockPrismaService.plan.findUnique.mockResolvedValue(basePlan);
      mockPrismaService.plan.update.mockResolvedValue({ ...basePlan, name: 'New Name' });

      const result = await service.update('plan-1', { name: 'New Name' });
      expect(result.name).toBe('New Name');
      expect(mockPrismaService.plan.updateMany).not.toHaveBeenCalled();
    });

    it('sets isDefault and unsets old default when isDefault:true', async () => {
      mockPrismaService.plan.findUnique.mockResolvedValue({ ...basePlan, isDefault: false });
      mockPrismaService.plan.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.plan.update.mockResolvedValue({ ...basePlan, isDefault: true });

      const result = await service.update('plan-1', { isDefault: true });
      expect(result.isDefault).toBe(true);
      expect(mockPrismaService.plan.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  describe('remove', () => {
    it('rejects deletion of plan with assigned users', async () => {
      mockPrismaService.plan.findUnique.mockResolvedValue({
        ...basePlan,
        _count: { users: 3 },
      });
      await expect(service.remove('plan-1')).rejects.toThrow(ConflictException);
      expect(mockPrismaService.plan.delete).not.toHaveBeenCalled();
    });

    it('deletes an empty plan', async () => {
      mockPrismaService.plan.findUnique.mockResolvedValue({
        ...basePlan,
        _count: { users: 0 },
      });
      mockPrismaService.plan.delete.mockResolvedValue(basePlan);

      const result = await service.remove('plan-1');
      expect(result.success).toBe(true);
      expect(mockPrismaService.plan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
    });

    it('throws NotFoundException for missing plan', async () => {
      mockPrismaService.plan.findUnique.mockResolvedValue(null);
      await expect(service.remove('nope')).rejects.toThrow(NotFoundException);
    });
  });
});