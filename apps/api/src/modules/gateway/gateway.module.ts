import { Global, Module } from '@nestjs/common';
import { CrawlGateway } from './crawl.gateway';

@Global()
@Module({
  providers: [CrawlGateway],
  exports: [CrawlGateway],
})
export class GatewayModule {}
