import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { QUEUES } from '@xcrawl/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.SCRAPE }),
    BullModule.registerQueue({ name: QUEUES.CRAWL }),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
