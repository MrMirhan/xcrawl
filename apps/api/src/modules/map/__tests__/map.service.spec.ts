import { MapService } from '../map.service';
import type { CrawlerEngineService } from '../../crawler-engine/crawler-engine.service';

const mockCrawlerEngineInstance = {
  map: jest.fn(),
};

const mockCrawlerEngineService = {
  get instance() {
    return mockCrawlerEngineInstance;
  },
};

describe('MapService', () => {
  let service: MapService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MapService(mockCrawlerEngineService as unknown as CrawlerEngineService);
  });

  describe('map', () => {
    it('returns success with links and count on happy path', async () => {
      const links = ['https://example.com/a', 'https://example.com/b'];
      mockCrawlerEngineInstance.map.mockResolvedValue(links);

      const result = await service.map({ url: 'https://example.com' });

      expect(result).toEqual({ success: true, links, count: 2 });
    });

    it('passes all options through to the crawler engine', async () => {
      const links = ['https://example.com/page'];
      mockCrawlerEngineInstance.map.mockResolvedValue(links);

      const options = {
        url: 'https://example.com',
        search: 'docs',
        includeSitemap: true,
        limit: 50,
      };
      await service.map(options);

      expect(mockCrawlerEngineInstance.map).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          search: 'docs',
          includeSitemap: true,
          limit: 50,
        }),
      );
    });

    it('returns count 0 when the engine returns an empty array', async () => {
      mockCrawlerEngineInstance.map.mockResolvedValue([]);

      const result = await service.map({ url: 'https://example.com' });

      expect(result).toEqual({ success: true, links: [], count: 0 });
    });

    it('propagates errors thrown by the crawler engine', async () => {
      mockCrawlerEngineInstance.map.mockRejectedValue(new Error('engine failure'));

      await expect(service.map({ url: 'https://example.com' })).rejects.toThrow('engine failure');
    });
  });
});
