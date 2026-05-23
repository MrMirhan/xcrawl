import { Injectable, NestMiddleware } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(
    @InjectMetric('http_requests_total') private readonly counter: Counter<string>,
    @InjectMetric('http_request_duration_seconds') private readonly histogram: Histogram<string>,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics') {
      next();
      return;
    }

    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const durationNs = Number(process.hrtime.bigint() - start);
      const durationSec = durationNs / 1e9;
      // Parameterized route prevents cardinality explosion. Fallback to 'unknown' for unmatched routes.
      const route = req.route?.path ?? 'unknown';
      const labels = { method: req.method, route, status: String(res.statusCode) };
      this.counter.inc(labels);
      this.histogram.observe(labels, durationSec);
    });

    next();
  }
}
