import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@xcrawl/db';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/users-admin.dto';

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async list(query: ListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = query.role ? { role: query.role } : {};

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async approve(id: string, role?: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.PENDING) {
      throw new ConflictException('User is not pending approval');
    }

    const targetRole = role ?? UserRole.USER;
    if (targetRole !== UserRole.USER && targetRole !== UserRole.ADMIN) {
      throw new BadRequestException('Approved role must be USER or ADMIN');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role: targetRole },
      select: USER_SELECT,
    });
    this.logger.log(`Approved user ${id} as ${targetRole}`);
    return updated;
  }

  async reject(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.PENDING) {
      throw new ConflictException('User is not pending approval');
    }

    await this.prisma.user.delete({ where: { id } });
    this.logger.log(`Rejected and deleted pending user ${id}`);
    return { success: true };
  }

  async updateRole(id: string, role: UserRole, requestingUserId: string) {
    if (id === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      const remainingAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, isActive: true, id: { not: id } },
      });
      if (remainingAdmins === 0) {
        throw new ForbiddenException('Cannot demote the last remaining admin');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: USER_SELECT,
    });
    this.logger.log(`Updated role of user ${id} to ${role}`);
    return updated;
  }

  async updateStatus(id: string, isActive: boolean, requestingUserId: string) {
    if (id === requestingUserId) {
      throw new ForbiddenException('Cannot change your own account status');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (isActive === false && user.role === UserRole.ADMIN) {
      const remainingAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, isActive: true, id: { not: id } },
      });
      if (remainingAdmins === 0) {
        throw new ForbiddenException('Cannot disable the last remaining admin');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: USER_SELECT,
    });
    this.logger.log(`Updated status of user ${id} to isActive=${isActive}`);
    return updated;
  }
}
