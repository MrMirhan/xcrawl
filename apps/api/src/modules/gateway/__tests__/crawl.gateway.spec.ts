import { CrawlGateway } from '../crawl.gateway';
import { Socket } from 'socket.io';

const mockJwtService = {
  verify: jest.fn().mockReturnValue({ sub: 'user1' }),
};

const mockConfigService = {
  get: jest.fn((k: string, d: string) => d),
  getOrThrow: jest.fn().mockReturnValue('test-secret'),
};

const mockPrismaService = {
  job: {
    findFirst: jest.fn(),
  },
};

const mockServer = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
};

function makeClient(overrides: Partial<{
  id: string;
  auth: Record<string, string>;
  query: Record<string, string>;
  userId: string | undefined;
}> = {}): Socket & { userId?: string } {
  const client = {
    id: overrides.id ?? 'client1',
    handshake: {
      auth: overrides.auth ?? { token: 'valid-jwt' },
      query: overrides.query ?? {},
    },
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    data: {},
    userId: overrides.userId,
  } as unknown as Socket & { userId?: string };
  return client;
}

describe('CrawlGateway', () => {
  let gateway: CrawlGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    mockJwtService.verify.mockReturnValue({ sub: 'user1' });

    gateway = new CrawlGateway(
      mockJwtService as never,
      mockConfigService as never,
      mockPrismaService as never,
    );

    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  describe('handleConnection', () => {
    it('sets userId on client when token is valid', () => {
      const client = makeClient();
      gateway.handleConnection(client);

      expect(mockJwtService.verify).toHaveBeenCalledWith('valid-jwt', { secret: 'test-secret' });
      expect(client.userId).toBe('user1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('accepts token from query string as fallback', () => {
      const client = makeClient({ auth: {}, query: { token: 'query-jwt' } });
      gateway.handleConnection(client);

      expect(mockJwtService.verify).toHaveBeenCalledWith('query-jwt', { secret: 'test-secret' });
      expect(client.userId).toBe('user1');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects client when no token is provided', () => {
      const client = makeClient({ auth: {}, query: {} });
      gateway.handleConnection(client);

      expect(mockJwtService.verify).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects client when token is invalid', () => {
      mockJwtService.verify.mockImplementationOnce(() => {
        throw new Error('invalid token');
      });
      const client = makeClient();
      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.userId).toBeUndefined();
    });
  });

  describe('handleDisconnect', () => {
    it('does not throw when client disconnects', () => {
      const client = makeClient();
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });

  describe('handleSubscribe', () => {
    it('joins the job room when userId matches job ownership', async () => {
      const client = makeClient({ userId: 'user1' });
      mockPrismaService.job.findFirst.mockResolvedValue({ id: 'job-abc', userId: 'user1' });

      await gateway.handleSubscribe(client, { jobId: 'job-abc' });

      expect(mockPrismaService.job.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-abc', userId: 'user1' },
      });
      expect(client.join).toHaveBeenCalledWith('job:job-abc');
    });

    it('emits error and does not join room when userId does not own the job', async () => {
      const client = makeClient({ userId: 'user1' });
      mockPrismaService.job.findFirst.mockResolvedValue(null);

      await gateway.handleSubscribe(client, { jobId: 'job-xyz' });

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Job not found' });
    });

    it('emits error and does not query prisma when client has no userId', async () => {
      const client = makeClient({ userId: undefined });

      await gateway.handleSubscribe(client, { jobId: 'job-abc' });

      expect(mockPrismaService.job.findFirst).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('error', { message: 'Unauthorized' });
    });

    it('returns early without error when jobId is missing', async () => {
      const client = makeClient({ userId: 'user1' });

      await gateway.handleSubscribe(client, { jobId: '' });

      expect(mockPrismaService.job.findFirst).not.toHaveBeenCalled();
      expect(client.emit).not.toHaveBeenCalled();
    });
  });

  describe('handleUnsubscribe', () => {
    it('leaves the job room when jobId is provided', () => {
      const client = makeClient();
      gateway.handleUnsubscribe(client, { jobId: 'job-abc' });

      expect(client.leave).toHaveBeenCalledWith('job:job-abc');
    });

    it('does not call leave when jobId is empty', () => {
      const client = makeClient();
      gateway.handleUnsubscribe(client, { jobId: '' });

      expect(client.leave).not.toHaveBeenCalled();
    });
  });

  describe('emitProgress', () => {
    it('emits job:progress to the correct room with merged data', () => {
      gateway.emitProgress('job-abc', { completed: 5, total: 20, currentUrl: 'https://example.com/page' });

      expect(mockServer.to).toHaveBeenCalledWith('job:job-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('job:progress', {
        jobId: 'job-abc',
        completed: 5,
        total: 20,
        currentUrl: 'https://example.com/page',
      });
    });
  });

  describe('emitPageComplete', () => {
    it('emits job:page to the correct room with url and statusCode', () => {
      gateway.emitPageComplete('job-abc', { url: 'https://example.com/done', statusCode: 200 });

      expect(mockServer.to).toHaveBeenCalledWith('job:job-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('job:page', {
        jobId: 'job-abc',
        url: 'https://example.com/done',
        statusCode: 200,
      });
    });

    it('emits job:page without statusCode when omitted', () => {
      gateway.emitPageComplete('job-abc', { url: 'https://example.com/done' });

      expect(mockServer.emit).toHaveBeenCalledWith('job:page', {
        jobId: 'job-abc',
        url: 'https://example.com/done',
      });
    });
  });

  describe('emitJobCompleted', () => {
    it('emits job:completed to the correct room', () => {
      gateway.emitJobCompleted('job-abc');

      expect(mockServer.to).toHaveBeenCalledWith('job:job-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('job:completed', { jobId: 'job-abc' });
    });
  });

  describe('emitJobFailed', () => {
    it('emits job:failed to the correct room with error message', () => {
      gateway.emitJobFailed('job-abc', 'crawler timeout');

      expect(mockServer.to).toHaveBeenCalledWith('job:job-abc');
      expect(mockServer.emit).toHaveBeenCalledWith('job:failed', {
        jobId: 'job-abc',
        error: 'crawler timeout',
      });
    });
  });
});
