import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrawlerEngine } from '@xcrawl/crawler';

@Injectable()
export class CrawlerEngineService implements OnModuleInit, OnModuleDestroy {
  private engine: CrawlerEngine;

  constructor(private config: ConfigService) {
    this.engine = new CrawlerEngine({
      maxConcurrency: this.config.get('crawler.maxConcurrency', 10),
      defaultTimeout: this.config.get('crawler.defaultTimeout', 30000),
      headless: this.config.get('crawler.headless', true),
    });
  }

  async onModuleInit() {
    await this.engine.initialize();
  }

  async onModuleDestroy() {
    await this.engine.shutdown();
  }

  get instance(): CrawlerEngine {
    return this.engine;
  }
}
