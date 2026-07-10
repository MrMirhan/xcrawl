import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(private prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.plan.findMany({
      include: { _count: { select: { users: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isDefault: row.isDefault,
      dailyPageLimit: row.dailyPageLimit,
      weeklyPageLimit: row.weeklyPageLimit,
      dailySearchLimit: row.dailySearchLimit,
      weeklySearchLimit: row.weeklySearchLimit,
      dailyExtractLimit: row.dailyExtractLimit,
      weeklyExtractLimit: row.weeklyExtractLimit,
      canUseOwnLlm: row.canUseOwnLlm,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      assignedUsers: row._count.users,
    }));
  }

  async create(dto: CreatePlanDto) {
    const existingCount = await this.prisma.plan.count();
    const shouldBeDefault = dto.isDefault === true || existingCount === 0;

    if (shouldBeDefault) {
      await this.prisma.plan.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        description: dto.description,
        dailyPageLimit: dto.dailyPageLimit,
        weeklyPageLimit: dto.weeklyPageLimit,
        dailySearchLimit: dto.dailySearchLimit,
        weeklySearchLimit: dto.weeklySearchLimit,
        dailyExtractLimit: dto.dailyExtractLimit,
        weeklyExtractLimit: dto.weeklyExtractLimit,
        canUseOwnLlm: dto.canUseOwnLlm,
        isDefault: shouldBeDefault,
      },
    });

    this.logger.log(`Created plan ${plan.id} (${plan.name})`);
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto) {
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plan not found');

    if (dto.isDefault === true) {
      await this.prisma.plan.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.dailyPageLimit !== undefined && { dailyPageLimit: dto.dailyPageLimit }),
        ...(dto.weeklyPageLimit !== undefined && { weeklyPageLimit: dto.weeklyPageLimit }),
        ...(dto.dailySearchLimit !== undefined && { dailySearchLimit: dto.dailySearchLimit }),
        ...(dto.weeklySearchLimit !== undefined && { weeklySearchLimit: dto.weeklySearchLimit }),
        ...(dto.dailyExtractLimit !== undefined && { dailyExtractLimit: dto.dailyExtractLimit }),
        ...(dto.weeklyExtractLimit !== undefined && { weeklyExtractLimit: dto.weeklyExtractLimit }),
        ...(dto.canUseOwnLlm !== undefined && { canUseOwnLlm: dto.canUseOwnLlm }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });

    this.logger.log(`Updated plan ${id}`);
    return updated;
  }

  async remove(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan._count.users > 0) {
      throw new ConflictException('Cannot delete a plan with assigned users');
    }

    await this.prisma.plan.delete({ where: { id } });
    this.logger.log(`Deleted plan ${id}`);
    return { success: true };
  }
}