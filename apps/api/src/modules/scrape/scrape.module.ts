import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScrapeController } from './scrape.controller';
import { ScrapeService } from './scrape.service';
import { ScrapeProcessor } from './scrape.processor';
import { QUEUES } from '@xcrawl/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.SCRAPE }),
  ],
  controllers: [ScrapeController],
  providers: [ScrapeService, ScrapeProcessor],
  exports: [ScrapeService],
})
export class ScrapeModule {}
