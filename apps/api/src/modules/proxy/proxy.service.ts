import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import type { Agent } from 'http';
import { PrismaService } from '../prisma/prisma.service';

// https-proxy-agent@8 is ESM-only (exports map has no `require`/`main`). Under
// `module: commonjs` tsc would downlevel a plain `import()` into `require()`,
// which throws `No "exports" main defined` at runtime. Indirecting through
// Function() preserves a genuine runtime dynamic import that Node's ESM
// resolver can satisfy. The same indirection is reused for socks-proxy-agent
// so neither package is downleveled regardless of its module format.
type HttpsProxyAgentModule = {
  HttpsProxyAgent: new (proxy: string) => Agent;
};
type SocksProxyAgentModule = {
  SocksProxyAgent: new (proxy: string) => Agent;
};
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<unknown>;

const SOCKS_PROTOCOLS = ['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'];

function isSocksProxy(proxyUrl: string): boolean {
  try {
    return SOCKS_PROTOCOLS.includes(new URL(proxyUrl).protocol);
  } catch {
    return proxyUrl.toLowerCase().startsWith('socks');
  }
}

async function createProxyAgent(proxyUrl: string): Promise<Agent> {
  if (isSocksProxy(proxyUrl)) {
    const { SocksProxyAgent } = (await importEsm('socks-proxy-agent')) as SocksProxyAgentModule;
    return new SocksProxyAgent(proxyUrl);
  }
  const { HttpsProxyAgent } = (await importEsm('https-proxy-agent')) as HttpsProxyAgentModule;
  return new HttpsProxyAgent(proxyUrl);
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(private prisma: PrismaService) {}

  async addProxy(data: { url: string; protocol?: string; country?: string }) {
    return this.prisma.proxyConfig.create({
      data: {
        url: data.url,
        protocol: data.protocol ?? 'http',
        country: data.country,
      },
    });
  }

  async listProxies() {
    return this.prisma.proxyConfig.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeProxy(id: string) {
    await this.prisma.proxyConfig.update({
      where: { id },
      data: { active: false },
    });
    return { success: true };
  }

  async testProxy(proxyUrl: string): Promise<{ success: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    let agent: Agent;
    try {
      agent = await createProxyAgent(proxyUrl);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Invalid proxy' };
    }

    return new Promise((resolve) => {
      const req = https.request(
        'https://api.ipify.org?format=json',
        { agent, timeout: 10_000 },
        (res) => {
          res.resume();
          const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
          resolve(
            ok
              ? { success: true, latency: Date.now() - start }
              : { success: false, error: `Unexpected status ${res.statusCode}` },
          );
        },
      );
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Connection timed out' });
      });
      req.end();
    });
  }

  async getActiveProxyUrls(): Promise<string[]> {
    const proxies = await this.prisma.proxyConfig.findMany({
      where: { active: true },
      select: { url: true },
    });
    return proxies.map((p: { url: string }) => p.url);
  }
}