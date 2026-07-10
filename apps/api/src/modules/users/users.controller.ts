import { Controller, Get, Patch, Delete, Param, Body, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { UserRole } from '@xcrawl/db';
import { UsersService } from './users.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApproveUserDto,
  ListUsersQueryDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/users-admin.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiSecurity('api-key')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.usersService.getOne(id);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveUserDto) {
    return this.usersService.approve(id, dto.role);
  }

  @Delete(':id/reject')
  reject(@Param('id') id: string) {
    return this.usersService.reject(id);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: { userId?: string },
  ) {
    return this.usersService.updateRole(id, dto.role, req.userId!);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: { userId?: string },
  ) {
    return this.usersService.updateStatus(id, dto.isActive, req.userId!);
  }
}
