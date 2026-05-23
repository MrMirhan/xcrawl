import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ExtractController } from './extract.controller';
import { ExtractService } from './extract.service';
import { ExtractProcessor } from './extract.processor';
import { LlmService } from './llm.service';
import { QUEUES } from '@xcrawl/shared';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.EXTRACT }),
  ],
  controllers: [ExtractController],
  providers: [ExtractService, ExtractProcessor, LlmService],
  exports: [LlmService, ExtractService],
})
export class ExtractModule {}
