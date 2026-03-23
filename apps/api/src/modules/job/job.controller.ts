import { Controller, Get, Post, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { JobService } from './job.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';

@ApiTags('Jobs')
@Controller('jobs')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class JobController {
  constructor(private jobService: JobService) {}

  @Get()
  async listJobs(
    @Req() req: { apiKeyId?: string; userId?: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.jobService.listJobs({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      type,
      status,
      userId: req.userId,
      apiKeyId: req.apiKeyId,
    });
  }

  @Post('cancel-all')
  async cancelAll(@Req() req: { apiKeyId?: string; userId?: string }) {
    return this.jobService.cancelAllRunning({ userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Get('stats')
  async getStats(@Req() req: { apiKeyId?: string; userId?: string }) {
    return this.jobService.getStats({ userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Get(':id')
  async getJob(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.jobService.getJob(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Get(':id/results')
  async getResults(
    @Param('id') id: string,
    @Req() req: { apiKeyId?: string; userId?: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobService.getJobResults(
      id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      { userId: req.userId, apiKeyId: req.apiKeyId },
    );
  }
}
