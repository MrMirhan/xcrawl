import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { ScrapeProcessor } from './scrape.processor';
import { UsageModule } from '../usage/usage.module';
import { QUEUES } from '@xcrawl/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.SCRAPE }),
    UsageModule,
  ],
  controllers: [ScrapeController],
  providers: [ScrapeService, ScrapeProcessor],
  exports: [ScrapeService],
})
export class ScrapeModule {}
