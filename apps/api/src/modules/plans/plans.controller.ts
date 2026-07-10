import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { UserRole } from '@xcrawl/db';
import { PlansService } from './plans.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';

@ApiTags('Plans')
@Controller('plans')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiSecurity('api-key')
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  list() {
    return this.plansService.list();
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.plansService.remove(id);
  }
}