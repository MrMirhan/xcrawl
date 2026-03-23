import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { JobRecoveryService } from './job-recovery.service';
import { QUEUES } from '@xcrawl/shared';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUES.SCRAPE },
      { name: QUEUES.CRAWL },
      { name: QUEUES.BATCH_SCRAPE },
      { name: QUEUES.EXTRACT },
    ),
  ],
  controllers: [JobController],
  providers: [JobService, JobRecoveryService],
  exports: [JobService],
})
export class JobModule {}
