import { CheerioCrawler, PlaywrightCrawler, log, Configuration } from 'crawlee';
import * as crypto from 'crypto';
import * as path from 'path';
import * as os from 'os';
import {
  htmlToMarkdown,
  extractMainContent,
  cleanHtml,
  extractLinks,
  extractImages,
  extractMetadata,
} from './transformers/index.js';
import { extractFullMetadata } from './transformers/metadata-extractor.js';
import { parsePdf, parseDocx, detectDocumentType } from './parsers/index.js';
import { executeActions } from './actions/index.js';
import { discoverSitemapUrls } from './sitemap/index.js';
import { parseRobotsTxt, isUrlAllowed } from './sitemap/robots-parser.js';
import {
  getStealthOptions,
  getRandomUserAgent,
  createTieredProxyConfig,
  createRoundRobinProxyConfig,
  getSessionPoolOptions,
  isBlocked,
  calculateDelay,
  dismissPopups,
  detectPaywall,
  rewriteUrl,
  getArchivedUrl,
} from './anti-blocking/index.js';
import type {
  EngineOptions,
  ScrapeOptions,
  ScrapeOutput,
  CrawlOptions,
  CrawlCallbacks,
  MapOptions,
} from './types.js';

export class CrawlerEngine {
  private readonly options: Required<EngineOptions>;

  constructor(options: EngineOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 10,
      defaultTimeout: options.defaultTimeout ?? 30_000,
      headless: options.headless ?? true,
      proxyUrls: options.proxyUrls ?? [],
      useSessionPool: options.useSessionPool ?? true,
    };
  }

  async initialize(): Promise<void> {
    log.setLevel(log.LEVELS.INFO);
    log.info('CrawlerEngine initialized', {
      maxConcurrency: this.options.maxConcurrency,
      headless: this.options.headless,
      proxyCount: this.options.proxyUrls.length,
    });
  }

  async shutdown(): Promise<void> {
    log.info('CrawlerEngine shutting down');
  }

  /**
   * Create a unique Crawlee Configuration to isolate storage per operation.
   */
  private createConfig(): Configuration {
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const storageDir = path.join(os.tmpdir(), 'xcrawl', uniqueId);
    return new Configuration({
      persistStorage: false,
      storageClientOptions: { localDataDirectory: storageDir },
    });
  }

  private selectEngine(options: ScrapeOptions): 'cheerio' | 'playwright' {
    if (options.engine && options.engine !== 'auto') return options.engine;
    if (options.actions?.length || options.waitFor || options.mobile) return 'playwright';
    const formats = options.formats ?? ['markdown'];
    if (formats.includes('screenshot')) return 'playwright';
    return 'cheerio';
  }

  private processContent(
    rawHtml: string,
    url: string,
    formats: string[],
    onlyMainContent: boolean,
    opts?: { includeTags?: string[]; excludeTags?: string[] },
  ): Partial<ScrapeOutput> {
    const result: Partial<ScrapeOutput> = {};
    const fullMeta = extractFullMetadata(rawHtml, url);
    const basicMeta = extractMetadata(rawHtml);

    let contentHtml = rawHtml;
    if (onlyMainContent) {
      const readable = extractMainContent(rawHtml, url);
      if (readable) {
        contentHtml = readable.content;
      }
    }

    for (const format of formats) {
      switch (format) {
        case 'markdown':
          result.markdown = htmlToMarkdown(contentHtml);
          break;
        case 'html':
          result.html = cleanHtml(contentHtml, opts);
          break;
        case 'rawHtml':
          result.rawHtml = rawHtml;
          break;
        case 'text': {
          const readable = extractMainContent(rawHtml, url);
          result.text = readable?.textContent ?? '';
          break;
        }
        case 'links':
          result.links = extractLinks(rawHtml, url);
          break;
        case 'images':
          result.images = extractImages(rawHtml, url);
          break;
      }
    }

    result.metadata = {
      title: fullMeta.title || basicMeta.title,
      description: fullMeta.description || basicMeta.description,
      language: fullMeta.language || basicMeta.language,
      ogImage: fullMeta.ogImage,
      favicon: fullMeta.favicon,
      author: fullMeta.author,
      keywords: fullMeta.keywords,
      canonical: fullMeta.canonical,
      jsonLd: fullMeta.jsonLd,
      duration: 0,
    };

    return result;
  }

  /**
   * Check if a Cheerio result looks like a JS-rendered page that needs a real browser.
   * Heuristics: very little text content, or body is mostly script tags.
   */
  private looksLikeJsSite(result: ScrapeOutput): boolean {
    const markdown = result.markdown ?? '';
    const text = result.rawHtml ?? '';

    // Very little meaningful content extracted
    if (markdown.length < 200) return true;

    // HTML is mostly scripts/noscript indicators
    if (text.includes('noscript') && text.includes('enable javascript')) return true;
    if (text.includes('__NEXT_DATA__') && markdown.length < 500) return true;
    if (text.includes('window.__remixContext') && markdown.length < 500) return true;
    if (text.includes('id="__nuxt"') && markdown.length < 500) return true;

    return false;
  }

  /**
   * Scrape a single URL with automatic retry and engine escalation.
   * Auto-detects JS-needed sites: if Cheerio returns little content, retries with Playwright.
   */
  /**
   * Scrape a document URL (PDF, DOCX) by downloading and parsing.
   */
  private async scrapeDocument(url: string, docType: 'pdf' | 'docx', startTime: number): Promise<ScrapeOutput> {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`Failed to download document: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    if (docType === 'pdf') {
      const result = await parsePdf(buffer);
      return {
        url,
        statusCode: response.status,
        markdown: result.markdown,
        text: result.text,
        metadata: {
          title: result.metadata.title,
          duration: Date.now() - startTime,
          statusCode: response.status,
        },
      };
    }

    // DOCX
    const result = await parseDocx(buffer);
    return {
      url,
      statusCode: response.status,
      markdown: result.markdown,
      html: result.html,
      text: result.text,
      metadata: {
        title: undefined,
        duration: Date.now() - startTime,
        statusCode: response.status,
      },
    };
  }

  async scrape(options: ScrapeOptions): Promise<ScrapeOutput> {
    const startTime = Date.now();
    const formats = options.formats ?? ['markdown'];
    const onlyMainContent = options.onlyMainContent ?? true;
    const timeout = options.timeout ?? this.options.defaultTimeout;

    // Document detection — handle PDFs and DOCX directly
    const docType = detectDocumentType(options.url);
    if (docType === 'pdf' || docType === 'docx') {
      log.info(`Document detected (${docType}): ${options.url}`);
      return this.scrapeDocument(options.url, docType, startTime);
    }

    // URL rewriting — try friendlier versions of known difficult sites
    const rewrite = rewriteUrl(options.url);
    if (rewrite.rewritten) {
      log.info(`URL rewritten (${rewrite.description}): ${options.url} → ${rewrite.url}`);
      options = { ...options, url: rewrite.url };
    }

    const engine = this.selectEngine(options);

    try {
      if (engine === 'cheerio') {
        const result = await this.scrapeWithCheerio(options, formats, onlyMainContent, timeout, startTime);

        if (result.statusCode && isBlocked(result.statusCode, result.rawHtml)) {
          log.info(`Blocked by Cheerio (${result.statusCode}), escalating to Playwright: ${options.url}`);
          return this.scrapeWithPlaywright(options, formats, onlyMainContent, timeout, startTime);
        }

        if (this.looksLikeJsSite(result)) {
          log.info(`JS-rendered site detected (${result.markdown?.length ?? 0} chars), escalating to Playwright: ${options.url}`);
          return this.scrapeWithPlaywright(options, formats, onlyMainContent, timeout, startTime);
        }

        return result;
      }

      return await this.scrapeWithPlaywright(options, formats, onlyMainContent, timeout, startTime);
    } catch (error) {
      // Cheerio failed → try Playwright
      if (engine === 'cheerio') {
        log.info(`Cheerio failed, retrying with Playwright: ${options.url}`);
        try {
          return await this.scrapeWithPlaywright(options, formats, onlyMainContent, timeout, startTime);
        } catch {
          // Both failed — try Wayback Machine archive as last resort
        }
      }

      // Last resort: try archived version
      log.info(`All engines failed for ${options.url}, trying Wayback Machine...`);
      const archivedUrl = await getArchivedUrl(options.url);
      if (archivedUrl) {
        log.info(`Found archived version: ${archivedUrl}`);
        return this.scrapeWithCheerio(
          { ...options, url: archivedUrl },
          formats, onlyMainContent, timeout, startTime,
        );
      }

      throw error;
    }
  }

  private scrapeWithCheerio(
    options: ScrapeOptions,
    formats: string[],
    onlyMainContent: boolean,
    timeout: number,
    startTime: number,
  ): Promise<ScrapeOutput> {
    const processContent = this.processContent.bind(this);
    const proxyConfig = createRoundRobinProxyConfig(this.options.proxyUrls);
    const sessionPoolOptions = getSessionPoolOptions();
    const config = this.createConfig();

    return new Promise((resolve, reject) => {
      let resolved = false;

      const crawler = new CheerioCrawler({
        maxConcurrency: 1,
        requestHandlerTimeoutSecs: Math.ceil(timeout / 1000),
        proxyConfiguration: proxyConfig,
        useSessionPool: this.options.useSessionPool,
        persistCookiesPerSession: true,
        sessionPoolOptions,
        additionalMimeTypes: ['application/xml', 'text/xml'],
        preNavigationHooks: [
          async (ctx) => {
            ctx.request.headers = {
              ...ctx.request.headers,
              'User-Agent': getRandomUserAgent(),
              ...(options.headers ?? {}),
            };
          },
        ],
        requestHandler: async ({ request, body, response, session }) => {
          const rawHtml = typeof body === 'string' ? body : body.toString();
          const statusCode = response.statusCode ?? 0;

          if (isBlocked(statusCode, rawHtml)) {
            session?.retire();
          } else {
            session?.markGood();
          }

          const result = processContent(rawHtml, request.url, formats, onlyMainContent, {
            includeTags: options.includeTags,
            excludeTags: options.excludeTags,
          });

          resolved = true;
          resolve({
            url: request.url,
            statusCode,
            ...result,
            metadata: {
              ...result.metadata!,
              statusCode,
              duration: Date.now() - startTime,
            },
          } as ScrapeOutput);
        },
        failedRequestHandler: async ({ request }, error) => {
          if (!resolved) {
            resolved = true;
            reject(new Error(`Failed to scrape ${request.url}: ${error.message}`));
          }
        },
      }, config);

      crawler.run([options.url]).then(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`No response received for ${options.url}`));
        }
      }).catch((err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  private scrapeWithPlaywright(
    options: ScrapeOptions,
    formats: string[],
    onlyMainContent: boolean,
    timeout: number,
    startTime: number,
  ): Promise<ScrapeOutput> {
    const processContent = this.processContent.bind(this);
    const proxyConfig = createTieredProxyConfig(this.options.proxyUrls);
    const stealthOpts = getStealthOptions();
    const sessionPoolOptions = getSessionPoolOptions();
    const config = this.createConfig();

    return new Promise((resolve, reject) => {
      let resolved = false;

      const crawler = new PlaywrightCrawler({
        maxConcurrency: 1,
        requestHandlerTimeoutSecs: Math.ceil(timeout / 1000),
        headless: this.options.headless,
        proxyConfiguration: proxyConfig,
        useSessionPool: this.options.useSessionPool,
        persistCookiesPerSession: true,
        sessionPoolOptions,
        ...stealthOpts,
        requestHandler: async ({ request, page, response, session }) => {
          // Wait for network to settle (SPA support)
          try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
          } catch {
            // Timeout is fine — some pages never fully idle
          }

          // Auto-dismiss popups/cookie banners
          if (options.dismissPopups !== false) {
            await dismissPopups(page);
          }

          if (options.waitFor) {
            await page.waitForTimeout(options.waitFor);
          }

          let actionScreenshots: string[] = [];
          if (options.actions?.length) {
            actionScreenshots = await executeActions(page, options.actions);
          }

          // Auto-scroll to trigger lazy loading (scroll down 3 times)
          try {
            for (let i = 0; i < 3; i++) {
              await page.evaluate(() => window.scrollBy(0, window.innerHeight));
              await page.waitForTimeout(300);
            }
            // Scroll back to top for screenshot
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(200);
          } catch {
            // Scroll failed, continue
          }

          const rawHtml = await page.content();
          const statusCode = response?.status() ?? 0;

          if (isBlocked(statusCode, rawHtml)) {
            session?.retire();
          } else {
            session?.markGood();
          }

          const result = processContent(rawHtml, request.url, formats, onlyMainContent, {
            includeTags: options.includeTags,
            excludeTags: options.excludeTags,
          });

          if (formats.includes('screenshot')) {
            const buffer = await page.screenshot({ fullPage: true });
            result.screenshot = buffer.toString('base64');
          }

          if (actionScreenshots.length > 0 && !result.screenshot) {
            result.screenshot = actionScreenshots.at(-1);
          }

          resolved = true;
          resolve({
            url: request.url,
            statusCode,
            ...result,
            metadata: {
              ...result.metadata!,
              statusCode,
              duration: Date.now() - startTime,
            },
          } as ScrapeOutput);
        },
        failedRequestHandler: async ({ request }, error) => {
          if (!resolved) {
            resolved = true;
            reject(new Error(`Failed to scrape ${request.url}: ${error.message}`));
          }
        },
      }, config);

      crawler.run([options.url]).then(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`No response received for ${options.url}`));
        }
      }).catch((err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
    });
  }

  /**
   * Crawl a domain recursively with robots.txt respect,
   * anti-blocking, retries, and configurable delays.
   */
  async crawl(options: CrawlOptions, callbacks: CrawlCallbacks): Promise<void> {
    const processContent = this.processContent.bind(this);
    const formats = options.formats ?? ['markdown'];
    const onlyMainContent = options.onlyMainContent ?? true;
    const maxPages = options.maxPages ?? 100;
    const timeout = options.timeout ?? this.options.defaultTimeout;
    const engine = options.engine ?? 'auto';
    const delay = options.delay ?? 0;
    const maxConcurrency = options.maxConcurrency ?? this.options.maxConcurrency;

    let pagesProcessed = 0;
    const shouldUseBrowser = engine === 'playwright' || (engine === 'auto' && formats.includes('screenshot'));
    const seenPaths = new Set<string>(); // for ignoreQueryParameters dedup
    const seenCanonicals = new Set<string>(); // canonical URL dedup
    const excludeUrls = new Set(options._excludeUrls ?? []); // already-crawled URLs (resume)

    const parsedUrl = new URL(options.url);
    const baseUrl = parsedUrl.origin;
    const baseHostname = parsedUrl.hostname;
    const robotsRules = await parseRobotsTxt(baseUrl);
    const effectiveDelay = delay || (robotsRules.crawlDelay ? robotsRules.crawlDelay * 1000 : 0);

    if (robotsRules.crawlDelay) {
      log.info(`Respecting robots.txt crawl-delay: ${robotsRules.crawlDelay}s`);
    }

    const proxyConfig = shouldUseBrowser
      ? createTieredProxyConfig(this.options.proxyUrls)
      : createRoundRobinProxyConfig(this.options.proxyUrls);

    const stealthOpts = shouldUseBrowser ? getStealthOptions() : {};
    const sessionPoolOptions = getSessionPoolOptions();
    const config = this.createConfig();

    let errorCount = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestHandler = async (ctx: any) => {
      if (callbacks.isCancelled()) return;
      if (pagesProcessed >= maxPages) return;

      const reqUrl = ctx.request.url;

      // Skip already-crawled URLs (resume after restart)
      if (excludeUrls.has(reqUrl)) {
        log.debug(`Skipping (already crawled): ${reqUrl}`);
        return;
      }

      // robots.txt check
      if (!isUrlAllowed(reqUrl, robotsRules)) {
        log.debug(`Skipping (robots.txt): ${reqUrl}`);
        return;
      }

      // Query parameter deduplication
      if (options.ignoreQueryParameters) {
        const pathOnly = new URL(reqUrl).pathname;
        if (seenPaths.has(pathOnly)) {
          log.debug(`Skipping (duplicate path): ${reqUrl}`);
          return;
        }
        seenPaths.add(pathOnly);
      }

      // Include/exclude path filtering with regex support
      if (options.includePaths?.length) {
        const testUrl = options.regexOnFullUrl ? reqUrl : new URL(reqUrl).pathname;
        const matches = options.includePaths.some((pattern) => {
          try { return new RegExp(pattern).test(testUrl); } catch { return testUrl.includes(pattern); }
        });
        if (!matches) {
          log.debug(`Skipping (not in includePaths): ${reqUrl}`);
          return;
        }
      }

      if (options.excludePaths?.length) {
        const testUrl = options.regexOnFullUrl ? reqUrl : new URL(reqUrl).pathname;
        const excluded = options.excludePaths.some((pattern) => {
          try { return new RegExp(pattern).test(testUrl); } catch { return testUrl.includes(pattern); }
        });
        if (excluded) {
          log.debug(`Skipping (excluded): ${reqUrl}`);
          return;
        }
      }

      // Subdomain check
      if (!options.allowExternalLinks && !options.allowSubdomains) {
        const reqHostname = new URL(reqUrl).hostname;
        if (reqHostname !== baseHostname) {
          log.debug(`Skipping (different hostname): ${reqUrl}`);
          return;
        }
      } else if (!options.allowExternalLinks && options.allowSubdomains) {
        const reqHostname = new URL(reqUrl).hostname;
        const baseDomain = baseHostname.split('.').slice(-2).join('.');
        const reqDomain = reqHostname.split('.').slice(-2).join('.');
        if (reqDomain !== baseDomain) {
          log.debug(`Skipping (external domain): ${reqUrl}`);
          return;
        }
      }

      // Adaptive delay
      if (effectiveDelay > 0) {
        const adaptiveDelay = calculateDelay({ baseDelay: effectiveDelay, errorCount });
        await new Promise((r) => setTimeout(r, adaptiveDelay));
      }

      const pageStart = Date.now();
      const rawHtml = ctx.page
        ? await ctx.page.content()
        : (typeof ctx.body === 'string' ? ctx.body : ctx.body?.toString() ?? '');

      const statusCode = ctx.page
        ? (ctx.response?.status?.() ?? 0)
        : (ctx.response?.statusCode ?? 0);

      if (isBlocked(statusCode, rawHtml)) {
        ctx.session?.retire();
        errorCount++;
        callbacks.onError(reqUrl, new Error(`Blocked (${statusCode})`));
        return;
      }
      ctx.session?.markGood();
      errorCount = Math.max(0, errorCount - 1);

      // Paywall detection
      if (options.skipPaywalls) {
        const paywall = detectPaywall(rawHtml, statusCode);
        if (paywall.isPaywalled) {
          callbacks.onError(reqUrl, new Error(`Paywalled: ${paywall.reason}`));
          log.debug(`Skipping (paywall): ${reqUrl} — ${paywall.reason}`);
          return;
        }
      }

      // Dismiss popups in crawl (Playwright only)
      if (options.dismissPopups !== false && ctx.page) {
        await dismissPopups(ctx.page);
      }

      const result = processContent(rawHtml, reqUrl, formats, onlyMainContent);

      // Canonical URL deduplication — skip if we already processed the canonical
      const canonical = result.metadata?.canonical;
      if (canonical) {
        if (seenCanonicals.has(canonical)) {
          log.debug(`Skipping (duplicate canonical): ${reqUrl} → ${canonical}`);
          return;
        }
        seenCanonicals.add(canonical);
      }

      if (formats.includes('screenshot') && ctx.page) {
        try {
          const buffer = await ctx.page.screenshot({ fullPage: true });
          result.screenshot = buffer.toString('base64');
          log.info(`Screenshot captured for ${reqUrl} (${buffer.length} bytes)`);
        } catch (err) {
          log.warning(`Screenshot failed for ${reqUrl}: ${err}`);
        }
      }

      const output: ScrapeOutput = {
        url: reqUrl,
        statusCode,
        ...result,
        metadata: {
          ...result.metadata!,
          statusCode,
          duration: Date.now() - pageStart,
        },
      } as ScrapeOutput;

      pagesProcessed++;
      await callbacks.onPageComplete(output);
      callbacks.onProgress(pagesProcessed, maxPages, reqUrl);

      // Enqueue discovered links (stop when close to limit)
      if (pagesProcessed < maxPages) {
        const remainingSlots = maxPages - pagesProcessed;
        const strategy = options.allowExternalLinks ? 'all'
          : options.allowSubdomains ? 'same-domain'
          : 'same-hostname';

        await ctx.enqueueLinks({ strategy, limit: remainingSlots });
      }
    };

    // Failed request handler — tracks errors and notifies via callback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const failedRequestHandler = async ({ request }: any, error: Error) => {
      errorCount++;
      callbacks.onError(request.url, error);
      log.warning(`Failed after retries: ${request.url} — ${error.message}`);
    };

    const commonOpts = {
      maxConcurrency,
      maxRequestsPerCrawl: maxPages,
      maxRequestRetries: 2,
      requestHandlerTimeoutSecs: Math.ceil(timeout / 1000),
      proxyConfiguration: proxyConfig,
      useSessionPool: this.options.useSessionPool,
      persistCookiesPerSession: true,
      sessionPoolOptions,
      requestHandler,
      failedRequestHandler,
    };

    if (shouldUseBrowser) {
      const crawler = new PlaywrightCrawler({
        ...commonOpts,
        headless: this.options.headless,
        ...stealthOpts,
      }, config);
      await crawler.run([options.url]);
    } else {
      const crawler = new CheerioCrawler({
        ...commonOpts,
        preNavigationHooks: [
          async (ctx) => {
            ctx.request.headers = {
              ...ctx.request.headers,
              'User-Agent': getRandomUserAgent(),
            };
          },
        ],
      }, config);
      await crawler.run([options.url]);
    }
  }

  /**
   * Discover URLs from sitemap, robots.txt, and page links.
   */
  async map(options: MapOptions): Promise<string[]> {
    const limit = options.limit ?? 5000;
    const allUrls = new Set<string>();
    const config = this.createConfig();

    const baseUrl = new URL(options.url).origin;
    const robotsRules = await parseRobotsTxt(baseUrl);
    for (const sitemapUrl of robotsRules.sitemaps) {
      try {
        const { urls } = await import('crawlee').then((m) => m.Sitemap.load(sitemapUrl));
        urls.forEach((u: string) => allUrls.add(u));
      } catch {
        // Sitemap from robots.txt failed
      }
    }

    if (options.includeSitemap !== false) {
      const sitemapUrls = await discoverSitemapUrls(options.url);
      sitemapUrls.forEach((u) => allUrls.add(u));
    }

    try {
      const crawler = new CheerioCrawler({
        maxConcurrency: 1,
        maxRequestsPerCrawl: 1,
        requestHandler: async ({ body, request }) => {
          const html = typeof body === 'string' ? body : body.toString();
          const links = extractLinks(html, request.url);
          links.forEach((l) => allUrls.add(l));
        },
      }, config);
      await crawler.run([options.url]);
    } catch {
      // Continue even if page crawl fails
    }

    let urls = Array.from(allUrls);
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      urls = urls.filter((u) => u.toLowerCase().includes(searchLower));
    }

    return urls.slice(0, limit);
  }
}
