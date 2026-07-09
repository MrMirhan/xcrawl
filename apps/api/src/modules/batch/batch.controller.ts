import { Controller, Post, Get, Param, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { BatchService } from './batch.service';
import { BatchScrapeRequestDto } from './dto/batch-request.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('Batch')
@Controller('batch/scrape')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
@ApiSecurity('api-key')
export class BatchController {
  constructor(private batchService: BatchService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async startBatch(@Body() dto: BatchScrapeRequestDto, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.batchService.startBatch(dto, req.apiKeyId, req.userId);
  }

  @Get(':id')
  async getStatus(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.batchService.getBatchStatus(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }
}
