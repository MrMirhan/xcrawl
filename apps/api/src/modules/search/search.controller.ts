import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchRequestDto } from './dto/search-request.dto';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeyRateLimitGuard } from '../../common/guards/rate-limit.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Search')
@Controller('search')
@UseGuards(ApiKeyGuard, ApiKeyRateLimitGuard)
@ApiSecurity('api-key')
export class SearchController {
  constructor(
    private searchService: SearchService,
    private prisma: PrismaService,
  ) {}

  @Post()
  async search(
    @Body() dto: SearchRequestDto,
    @Req() req: { userId?: string },
  ) {
    // Load per-user SearXNG URL if not provided in the request
    if (!dto.searxngUrl && req.userId) {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId: req.userId },
        select: { searxngUrl: true },
      });
      if (settings?.searxngUrl) {
        dto.searxngUrl = settings.searxngUrl;
      }
    }
    return this.searchService.search(dto, req.userId);
  }
}
