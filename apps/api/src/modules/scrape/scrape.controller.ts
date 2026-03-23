import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { ScrapeService } from './scrape.service';
import { ScrapeRequestDto } from './dto/scrape-request.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';

@ApiTags('Scrape')
@Controller('scrape')
export class ScrapeController {
  constructor(private scrapeService: ScrapeService) {}

  @Post()
  @UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
  @ApiSecurity('api-key')
  async scrape(@Body() dto: ScrapeRequestDto, @Req() req: { apiKeyId?: string; userId?: string }) {
    return this.scrapeService.scrape(dto, req.apiKeyId, req.userId);
  }
}
