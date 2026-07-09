import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ApiKeyGuard } from '../api-key.guard';
import { ApiKeyRateLimitGuard } from '../rate-limit.guard';
import { ScrapeController } from '../../../modules/scrape/scrape.controller';
import { CrawlController } from '../../../modules/crawl/crawl.controller';
import { BatchController } from '../../../modules/batch/batch.controller';
import { MapController } from '../../../modules/map/map.controller';
import { ExtractController } from '../../../modules/extract/extract.controller';
import { JobController } from '../../../modules/job/job.controller';
import { WebhookController } from '../../../modules/webhook/webhook.controller';
import { ProxyController } from '../../../modules/proxy/proxy.controller';
import { ScheduleController } from '../../../modules/schedule/schedule.controller';
import { SearchController } from '../../../modules/search/search.controller';
import { StorageController } from '../../../modules/storage/storage.controller';
import { McpController } from '../../../modules/mcp/mcp.controller';
import { UserAuthController } from '../../../modules/user-auth/user-auth.controller';
import { HealthController } from '../../../modules/health/health.controller';

type GuardClass = new (...args: any[]) => unknown;

/**
 * @UseGuards() on a controller class writes to the class constructor's metadata.
 * Nest evaluates the guards array left-to-right, so ApiKeyGuard must appear
 * before ApiKeyRateLimitGuard for the limiter to see req.userId / req.apiKeyId.
 */
const classLevelControllers: [string, GuardClass][] = [
  ['BatchController', BatchController],
  ['CrawlController', CrawlController],
  ['ExtractController', ExtractController],
  ['JobController', JobController],
  ['MapController', MapController],
  ['McpController', McpController],
  ['ProxyController', ProxyController],
  ['ScheduleController', ScheduleController],
  ['SearchController', SearchController],
  ['StorageController', StorageController],
  ['WebhookController', WebhookController],
];

describe('rate-limit guard wiring across controllers', () => {
  describe.each(classLevelControllers)('%s', (_name, controller) => {
    it('has both ApiKeyGuard and ApiKeyRateLimitGuard bound at the class level', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as GuardClass[] | undefined;

      expect(guards).toBeDefined();
      expect(guards).toContain(ApiKeyGuard);
      expect(guards).toContain(ApiKeyRateLimitGuard);
    });

    it('runs ApiKeyGuard before ApiKeyRateLimitGuard so req.userId/apiKeyId are set first', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) as GuardClass[];

      expect(guards.indexOf(ApiKeyGuard)).toBeLessThan(guards.indexOf(ApiKeyRateLimitGuard));
    });
  });

  describe('ScrapeController (method-level, the original wiring)', () => {
    it('scrape() has ApiKeyGuard before ApiKeyRateLimitGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        ScrapeController.prototype.scrape,
      ) as GuardClass[];

      expect(guards).toBeDefined();
      expect(guards.indexOf(ApiKeyGuard)).toBeLessThan(guards.indexOf(ApiKeyRateLimitGuard));
    });
  });

  describe('UserAuthController signin/signup (unauthenticated, IP-scoped)', () => {
    it('signup() is rate-limited without requiring ApiKeyGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        UserAuthController.prototype.signup,
      ) as GuardClass[] | undefined;

      expect(guards).toBeDefined();
      expect(guards).toContain(ApiKeyRateLimitGuard);
      expect(guards).not.toContain(ApiKeyGuard);
    });

    it('signin() is rate-limited without requiring ApiKeyGuard', () => {
      const guards = Reflect.getMetadata(
        GUARDS_METADATA,
        UserAuthController.prototype.signin,
      ) as GuardClass[] | undefined;

      expect(guards).toBeDefined();
      expect(guards).toContain(ApiKeyRateLimitGuard);
      expect(guards).not.toContain(ApiKeyGuard);
    });
  });

  describe('HealthController', () => {
    it('has no ApiKeyRateLimitGuard bound (liveness probes must not be throttled)', () => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, HealthController) as GuardClass[] | undefined;

      expect(guards ?? []).not.toContain(ApiKeyRateLimitGuard);
    });
  });
});
