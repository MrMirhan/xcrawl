import { Global, Module } from '@nestjs/common';
import { CrawlerEngineService } from './crawler-engine.service';

@Global()
@Module({
  providers: [CrawlerEngineService],
  exports: [CrawlerEngineService],
})
export class CrawlerEngineModule {}
