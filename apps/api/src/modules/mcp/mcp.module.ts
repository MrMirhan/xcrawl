import { Module } from '@nestjs/common';
import { ScrapeModule } from '../scrape/scrape.module';
import { CrawlModule } from '../crawl/crawl.module';
import { MapModule } from '../map/map.module';
import { SearchModule } from '../search/search.module';
import { JobModule } from '../job/job.module';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

@Module({
  imports: [ScrapeModule, CrawlModule, MapModule, SearchModule, JobModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
