import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CrawlerEngineService } from '../crawler-engine/crawler-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from './llm.service';
import { QUEUES } from '@xcrawl/shared';

@Processor(QUEUES.EXTRACT)
export class ExtractProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractProcessor.name);

  constructor(
    private crawlerEngine: CrawlerEngineService,
    private prisma: PrismaService,
    private llm: LlmService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { jobId, urls, schema, prompt } = job.data;
    this.logger.log(`Processing extract job ${jobId}`);

    await this.prisma.job.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });

    const jobRecord = await this.prisma.job.findUnique({ where: { id: jobId }, select: { userId: true } });
    if (!jobRecord) {
      this.logger.error(`Extract job ${jobId} not found in database`);
      return;
    }
    let successCount = 0;
    const errors: string[] = [];

    for (const url of urls) {
      try {
        const scrapeResult = await this.crawlerEngine.instance.scrape({
          url,
          formats: ['markdown', 'html'],
          onlyMainContent: true,
        });

        this.logger.log(`Extracting from ${url} with prompt="${prompt?.slice(0, 50)}"`);

        const content = scrapeResult.markdown && scrapeResult.markdown.length > 0
          ? scrapeResult.markdown
          : (scrapeResult.html ?? '');

        const extractedData = await this.llm.extract(
          content,
          {
            schema,
            prompt,
            userId: jobRecord?.userId ?? undefined,
          },
        );

        await this.prisma.jobResult.create({
          data: {
            jobId,
            url,
            markdown: scrapeResult.markdown,
            extractedData: extractedData as object,
            metadata: scrapeResult.metadata as object,
          },
        });

        successCount++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Extract failed for ${url}: ${msg}`);
        errors.push(`${url}: ${msg}`);

        // Record partial result so the user sees which URLs failed
        await this.prisma.jobResult.create({
          data: {
            jobId,
            url,
            metadata: { error: msg } as object,
          },
        });
      }
    }

    const finalStatus = successCount === 0 ? 'FAILED' : successCount < urls.length ? 'PARTIAL' : 'COMPLETED';
    await this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
        resultCount: successCount,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      },
    });
  }
}
