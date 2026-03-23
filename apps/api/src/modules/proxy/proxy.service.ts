import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    return new Promise((resolve) => {
      // @ts-expect-error dynamic import types not resolvable under commonjs moduleResolution
      Promise.all([import('https-proxy-agent'), import('https')]).then(
        ([{ HttpsProxyAgent }, https]) => {
          const agent = new HttpsProxyAgent(proxyUrl);
          const req = https.request(
            'https://httpbin.org/ip',
            { agent, timeout: 10_000 },
            (res) => {
              res.resume();
              const ok = (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300;
              resolve({ success: ok, latency: Date.now() - start });
            },
          );
          req.on('error', (err) => resolve({ success: false, error: err.message }));
          req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, error: 'Connection timed out' });
          });
          req.end();
        },
      ).catch((err: Error) => resolve({ success: false, error: err.message }));
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