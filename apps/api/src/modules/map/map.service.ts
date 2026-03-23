import { Injectable, Logger } from '@nestjs/common';
import { CrawlerEngineService } from '../crawler-engine/crawler-engine.service';

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);

  constructor(private crawlerEngine: CrawlerEngineService) {}

  async map(options: { url: string; search?: string; includeSitemap?: boolean; limit?: number }) {
    const links = await this.crawlerEngine.instance.map(options);

    return {
      success: true,
      links,
      count: links.length,
    };
  }
}
