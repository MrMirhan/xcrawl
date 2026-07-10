import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './crawl.service';
import { CrawlProcessor } from './crawl.processor';
import { WebhookModule } from '../webhook/webhook.module';
import { UsageModule } from '../usage/usage.module';
import { QUEUES } from '@xcrawl/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.CRAWL }),
    ConfigModule,
    WebhookModule,
    UsageModule,
  ],
  controllers: [CrawlController],
  providers: [CrawlService, CrawlProcessor],
  exports: [CrawlService],
})
export class CrawlModule {}
