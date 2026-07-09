import { Controller, Get, Param, Res, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ownedWhere } from '../../common/utils/ownership';

@ApiTags('Storage')
@Controller('storage')
@UseGuards(ApiKeyGuard)
@ApiSecurity('api-key')
export class StorageController {
  constructor(
    private storage: StorageService,
    private prisma: PrismaService,
  ) {}

  @Get('screenshots/:jobId')
  async getScreenshot(
    @Param('jobId') jobId: string,
    @Req() req: { apiKeyId?: string; userId?: string },
    @Res() res: Response,
  ) {
    // Verify job ownership
    const job = await this.prisma.job.findFirst({
      where: ownedWhere(jobId, { userId: req.userId, apiKeyId: req.apiKeyId }),
      select: { id: true },
    });
    if (!job) throw new NotFoundException('Job not found');

    // Find the screenshot path from job results
    const result = await this.prisma.jobResult.findFirst({
      where: { jobId, screenshotPath: { not: null } },
      select: { screenshotPath: true },
    });
    if (!result?.screenshotPath) throw new NotFoundException('Screenshot not found');

    try {
      const buffer = await this.storage.readFile(result.screenshotPath);
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
      res.send(buffer);
    } catch {
      throw new NotFoundException('Screenshot file not found');
    }
  }
}
