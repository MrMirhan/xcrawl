import { ProxyService } from '../proxy.service';

const mockPrismaService = {
  proxyConfig: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('ProxyService', () => {
  let service: ProxyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProxyService(mockPrismaService as any);
  });

  describe('addProxy', () => {
    it('creates a proxy with the provided url', async () => {
      mockPrismaService.proxyConfig.create.mockResolvedValue({ id: 'proxy-1', url: 'http://proxy.example.com:3128' });

      await service.addProxy({ url: 'http://proxy.example.com:3128' });

      expect(mockPrismaService.proxyConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ url: 'http://proxy.example.com:3128' }),
        }),
      );
    });

    it('defaults protocol to "http" when not provided', async () => {
      mockPrismaService.proxyConfig.create.mockResolvedValue({});

      await service.addProxy({ url: 'http://proxy.example.com:3128' });

      expect(mockPrismaService.proxyConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ protocol: 'http' }),
        }),
      );
    });

    it('uses the provided protocol when explicitly specified', async () => {
      mockPrismaService.proxyConfig.create.mockResolvedValue({});

      await service.addProxy({ url: 'socks5://proxy.example.com:1080', protocol: 'socks5' });

      expect(mockPrismaService.proxyConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ protocol: 'socks5' }),
        }),
      );
    });

    it('stores the country when provided', async () => {
      mockPrismaService.proxyConfig.create.mockResolvedValue({});

      await service.addProxy({ url: 'http://proxy.example.com:3128', country: 'US' });

      expect(mockPrismaService.proxyConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ country: 'US' }),
        }),
      );
    });

    it('stores undefined country when not provided', async () => {
      mockPrismaService.proxyConfig.create.mockResolvedValue({});

      await service.addProxy({ url: 'http://proxy.example.com:3128' });

      expect(mockPrismaService.proxyConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ country: undefined }),
        }),
      );
    });

    it('returns the created proxy record', async () => {
      const created = { id: 'proxy-1', url: 'http://proxy.example.com:3128', protocol: 'http', active: true };
      mockPrismaService.proxyConfig.create.mockResolvedValue(created);

      const result = await service.addProxy({ url: 'http://proxy.example.com:3128' });

      expect(result).toEqual(created);
    });
  });

  describe('listProxies', () => {
    it('returns only active proxies', async () => {
      const activeProxies = [
        { id: 'p1', url: 'http://proxy1.com', active: true },
        { id: 'p2', url: 'http://proxy2.com', active: true },
      ];
      mockPrismaService.proxyConfig.findMany.mockResolvedValue(activeProxies);

      const result = await service.listProxies();

      expect(mockPrismaService.proxyConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { active: true } }),
      );
      expect(result).toEqual(activeProxies);
    });

    it('orders results by createdAt descending', async () => {
      mockPrismaService.proxyConfig.findMany.mockResolvedValue([]);

      await service.listProxies();

      expect(mockPrismaService.proxyConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });

    it('returns an empty array when no active proxies exist', async () => {
      mockPrismaService.proxyConfig.findMany.mockResolvedValue([]);

      const result = await service.listProxies();

      expect(result).toEqual([]);
    });
  });

  describe('removeProxy', () => {
    it('sets active to false (soft-delete) rather than hard-deleting', async () => {
      mockPrismaService.proxyConfig.update.mockResolvedValue({});

      await service.removeProxy('proxy-1');

      expect(mockPrismaService.proxyConfig.update).toHaveBeenCalledWith({
        where: { id: 'proxy-1' },
        data: { active: false },
      });
    });

    it('returns { success: true } after soft-delete', async () => {
      mockPrismaService.proxyConfig.update.mockResolvedValue({});

      const result = await service.removeProxy('proxy-1');

      expect(result).toEqual({ success: true });
    });

    it('calls update with the correct proxy id', async () => {
      mockPrismaService.proxyConfig.update.mockResolvedValue({});

      await service.removeProxy('proxy-specific-id');

      expect(mockPrismaService.proxyConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'proxy-specific-id' } }),
      );
    });
  });

  describe('clearAllProxies', () => {
    it('hard-deletes every proxy via deleteMany with an empty filter', async () => {
      mockPrismaService.proxyConfig.deleteMany.mockResolvedValue({ count: 0 });

      await service.clearAllProxies();

      expect(mockPrismaService.proxyConfig.deleteMany).toHaveBeenCalledWith({});
    });

    it('returns success with the number of deleted proxies', async () => {
      mockPrismaService.proxyConfig.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.clearAllProxies();

      expect(result).toEqual({ success: true, count: 3 });
    });

    it('returns count 0 when no proxies exist', async () => {
      mockPrismaService.proxyConfig.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.clearAllProxies();

      expect(result).toEqual({ success: true, count: 0 });
    });
  });

  describe('getActiveProxyUrls', () => {
    it('returns only the url strings from active proxies', async () => {
      mockPrismaService.proxyConfig.findMany.mockResolvedValue([
        { url: 'http://proxy1.com:3128' },
        { url: 'http://proxy2.com:3128' },
      ]);

      const result = await service.getActiveProxyUrls();

      expect(result).toEqual(['http://proxy1.com:3128', 'http://proxy2.com:3128']);
    });

    it('queries only active proxies and selects only the url field', async () => {
      mockPrismaService.proxyConfig.findMany.mockResolvedValue([]);

      await service.getActiveProxyUrls();

      expect(mockPrismaService.proxyConfig.findMany).toHaveBeenCalledWith({
        where: { active: true },
        select: { url: true },
      });
    });

    it('returns an empty array when no active proxies exist', async () => {
      mockPrismaService.proxyConfig.findMany.mockResolvedValue([]);

      const result = await service.getActiveProxyUrls();

      expect(result).toEqual([]);
    });

    it('returns only url strings, not full proxy objects', async () => {
      mockPrismaService.proxyConfig.findMany.mockResolvedValue([
        { url: 'http://proxy1.com:3128' },
      ]);

      const result = await service.getActiveProxyUrls();

      result.forEach((item) => {
        expect(typeof item).toBe('string');
      });
    });
  });
});
