import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import appConfig, { redisConfig, databaseConfig, crawlerConfig, storageConfig } from './config/app.config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { CrawlerEngineModule } from './modules/crawler-engine/crawler-engine.module';
import { StorageModule } from './modules/storage/storage.module';
import { CacheModule } from './modules/cache/cache.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { ScrapeModule } from './modules/scrape/scrape.module';
import { CrawlModule } from './modules/crawl/crawl.module';
import { BatchModule } from './modules/batch/batch.module';
import { MapModule } from './modules/map/map.module';
import { ExtractModule } from './modules/extract/extract.module';
import { JobModule } from './modules/job/job.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { ProxyModule } from './modules/proxy/proxy.module';
import { UserAuthModule } from './modules/user-auth/user-auth.module';
import { SearchModule } from './modules/search/search.module';
import { ScheduleModule as CrawlScheduleModule } from './modules/schedule/schedule.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';

@Module({
  imports: [
    // Configuration — loads .env from monorepo root and app directory
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      load: [appConfig, redisConfig, databaseConfig, crawlerConfig, storageConfig],
    }),

    // Structured logging (pino backend for NestJS Logger)
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get('app.nodeEnv') === 'production';
        return {
          pinoHttp: {
            level: isProd ? 'info' : 'debug',
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const incoming = req.headers['x-request-id'];
              const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            transport: isProd
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true, translateTime: 'HH:MM:ss.l' },
                },
            redact: [
              'req.headers.authorization',
              'req.headers["x-api-key"]',
              'req.body.password',
              'req.body.apiKey',
            ],
            autoLogging: {
              ignore: (req: IncomingMessage) => req.url === '/api/v1/health',
            },
          },
        };
      },
    }),

    // Scheduled tasks (cleanup, etc.)
    ScheduleModule.forRoot(),

    // BullMQ (Redis-backed job queue)
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get('redis.url', 'redis://localhost:6379');
        return { connection: { url: redisUrl } };
      },
    }),

    // Core infrastructure
    PrismaModule,
    CrawlerEngineModule,
    StorageModule,
    CacheModule,
    GatewayModule,

    // Feature modules
    UserAuthModule,
    AuthModule,
    HealthModule,
    ScrapeModule,
    CrawlModule,
    BatchModule,
    MapModule,
    ExtractModule,
    JobModule,
    WebhookModule,
    ProxyModule,
    SearchModule,
    CrawlScheduleModule,
    CleanupModule,
  ],
})
export class AppModule {}
