import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BatchController } from './batch.controller';
import { BatchService } from './batch.service';
import { BatchProcessor } from './batch.processor';
import { QUEUES } from '@xcrawl/shared';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.BATCH_SCRAPE }),
  ],
  controllers: [BatchController],
  providers: [BatchService, BatchProcessor],
})
export class BatchModule {}
