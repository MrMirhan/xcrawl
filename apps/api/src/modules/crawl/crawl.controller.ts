import { Controller, Post, Get, Delete, Param, Body, Query, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { CrawlService } from './crawl.service';
import { CrawlRequestDto } from './dto/crawl-request.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('Crawl')
@Controller('crawl')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
@ApiSecurity('api-key')
export class CrawlController {
  constructor(private crawlService: CrawlService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async startCrawl(@Body() dto: CrawlRequestDto, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.crawlService.startCrawl(dto, req.apiKeyId, req.userId);
  }

  @Get(':id')
  async getStatus(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.crawlService.getCrawlStatus(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }

  @Get(':id/results')
  async getResults(
    @Param('id') id: string,
    @Req() req: { apiKeyId?: string; userId?: string },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.crawlService.getCrawlResults(
      id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      { userId: req.userId, apiKeyId: req.apiKeyId },
    );
  }

  @Delete(':id')
  async cancel(@Param('id') id: string, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.crawlService.cancelCrawl(id, { userId: req.userId, apiKeyId: req.apiKeyId });
  }
}
