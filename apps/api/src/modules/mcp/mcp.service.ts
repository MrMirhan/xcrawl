import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { ScrapeService } from '../scrape/scrape.service';
import { CrawlService } from '../crawl/crawl.service';
import { MapService } from '../map/map.service';
import { SearchService } from '../search/search.service';
import { ExtractService } from '../extract/extract.service';
import { JobService } from '../job/job.service';
import { PrismaService } from '../prisma/prisma.service';
import { registerScrapeTool } from './tools/scrape.tool';
import { registerCrawlTool } from './tools/crawl.tool';
import { registerMapTool } from './tools/map.tool';
import { registerSearchTool } from './tools/search.tool';
import { registerExtractTool } from './tools/extract.tool';
import { registerJobTools } from './tools/job.tool';

export interface McpAuth {
  apiKeyId?: string;
  userId?: string;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
}

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

@Injectable()
export class McpService implements OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private readonly sessions = new Map<string, Session>();
  private sweeper?: NodeJS.Timeout;

  constructor(
    private scrape: ScrapeService,
    private crawl: CrawlService,
    private map: MapService,
    private search: SearchService,
    private extract: ExtractService,
    private job: JobService,
    private prisma: PrismaService,
  ) {
    this.sweeper = setInterval(() => this.sweepIdleSessions(), 5 * 60 * 1000);
    this.sweeper.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const session of this.sessions.values()) {
      await session.transport.close().catch(() => undefined);
    }
    this.sessions.clear();
  }

  getSession(sessionId: string): StreamableHTTPServerTransport | undefined {
    return this.sessions.get(sessionId)?.transport;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async createSession(auth: McpAuth): Promise<StreamableHTTPServerTransport> {
    const server = this.buildServer(auth);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.sessions.set(sessionId, { transport, server, createdAt: Date.now() });
        this.logger.log(`MCP session opened ${sessionId} user=${auth.userId ?? '-'} apiKey=${auth.apiKeyId ?? '-'}`);
      },
      onsessionclosed: (sessionId) => {
        this.closeSession(sessionId).catch((err) => this.logger.warn(`session close failed ${sessionId}: ${err}`));
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) this.closeSession(sid).catch(() => undefined);
    };

    await server.connect(transport);
    return transport;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.delete(sessionId);
    await session.transport.close().catch(() => undefined);
    this.logger.log(`MCP session closed ${sessionId}`);
  }

  private buildServer(auth: McpAuth): McpServer {
    const server = new McpServer(
      { name: 'xcrawl', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    registerScrapeTool(server, this.scrape, auth);
    registerCrawlTool(server, this.crawl, auth);
    registerMapTool(server, this.map);
    registerSearchTool(server, this.search, this.prisma, auth);
    registerExtractTool(server, this.extract, auth);
    registerJobTools(server, this.job, auth);

    return server;
  }

  private sweepIdleSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.createdAt > SESSION_IDLE_TIMEOUT_MS) {
        this.closeSession(id).catch(() => undefined);
      }
    }
  }
}
