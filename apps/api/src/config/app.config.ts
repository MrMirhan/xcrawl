import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.API_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  disableRegistration: process.env.DISABLE_REGISTRATION === 'true',
  registrationRequireApproval: process.env.REGISTRATION_REQUIRE_APPROVAL === 'true',
}));

export const redisConfig = registerAs('redis', () => ({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
}));

export const databaseConfig = registerAs('database', () => ({
  url: process.env.DATABASE_URL || 'postgresql://xcrawl:xcrawl@localhost:5432/xcrawl',
}));

export const crawlerConfig = registerAs('crawler', () => ({
  maxConcurrency: parseInt(process.env.CRAWLER_MAX_CONCURRENCY || '10', 10),
  defaultTimeout: parseInt(process.env.CRAWLER_DEFAULT_TIMEOUT || '30000', 10),
  headless: process.env.CRAWLER_HEADLESS !== 'false',
}));

export const storageConfig = registerAs('storage', () => ({
  provider: process.env.STORAGE_PROVIDER || 'local',
  path: process.env.STORAGE_PATH || './data/storage',
  s3: {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET || 'xcrawl',
    accessKey: process.env.S3_ACCESS_KEY,
    secretKey: process.env.S3_SECRET_KEY,
    region: process.env.S3_REGION || 'us-east-1',
  },
}));
