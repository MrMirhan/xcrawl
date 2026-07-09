import { Controller, Post, Get, Patch, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('Schedules')
@Controller('schedules')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
@ApiSecurity('api-key')
export class ScheduleController {
  constructor(private scheduleService: ScheduleService) {}

  @Post()
  async create(@Body() dto: CreateScheduleDto, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.scheduleService.create(dto, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Get()
  async list(@Req() req: { apiKeyId?: string; userId?: string }) {
    return this.scheduleService.list({ userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.scheduleService.get(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Req() req: { apiKeyId?: string; userId?: string },
    @Body() body: { name?: string; cron?: string; config?: Record<string, unknown>; active?: boolean },
  ) {
    return this.scheduleService.update(id, body, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Patch(':id/toggle')
  async toggle(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.scheduleService.toggle(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.scheduleService.remove(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }
}
