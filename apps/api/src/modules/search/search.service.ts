import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrawlerEngineService } from '../crawler-engine/crawler-engine.service';
import { SearchRequestDto } from './dto/search-request.dto';

interface SearchResult {
  url: string;
  title: string;
  snippet: string;
}

interface ScrapeResult {
  url: string;
  title?: string;
  snippet: string;
  markdown?: string;
  html?: string;
  links?: string[];
  statusCode?: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private config: ConfigService,
    private crawlerEngine: CrawlerEngineService,
  ) {}

  async search(dto: SearchRequestDto) {
    const limit = dto.limit ?? 5;
    const formats = dto.formats ?? ['markdown'];
    const searxngUrl = dto.searxngUrl ?? this.config.get('SEARXNG_URL', '');

    // Step 1: Get search results
    let searchResults: SearchResult[];

    if (searxngUrl) {
      searchResults = await this.searchWithSearXNG(dto.query, limit, searxngUrl);
    } else {
      searchResults = await this.searchWithDuckDuckGo(dto.query, limit);
    }

    if (searchResults.length === 0) {
      return { success: true, data: [], count: 0 };
    }

    // Step 2: Scrape each result URL
    const results: ScrapeResult[] = [];

    for (const sr of searchResults.slice(0, limit)) {
      try {
        const scraped = await this.crawlerEngine.instance.scrape({
          url: sr.url,
          formats: formats as ('markdown' | 'html' | 'text' | 'rawHtml' | 'links' | 'images' | 'screenshot')[],
          onlyMainContent: true,
          timeout: 15_000,
          engine: (dto.engine as 'auto' | 'cheerio' | 'playwright') ?? 'auto',
        });

        results.push({
          url: sr.url,
          title: scraped.metadata?.title ?? sr.title,
          snippet: sr.snippet,
          markdown: scraped.markdown,
          html: scraped.html,
          links: scraped.links,
          statusCode: scraped.statusCode,
        });
      } catch {
        results.push({
          url: sr.url,
          title: sr.title,
          snippet: sr.snippet,
        });
      }
    }

    return {
      success: true,
      data: results,
      count: results.length,
      query: dto.query,
    };
  }

  private async searchWithSearXNG(query: string, limit: number, baseUrl: string): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        format: 'json',
        categories: 'general',
      });

      const response = await fetch(`${baseUrl}/search?${params}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) return [];

      const data = await response.json() as { results?: { url: string; title: string; content: string }[] };
      return (data.results ?? []).slice(0, limit).map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content,
      }));
    } catch {
      return [];
    }
  }

  private async searchWithDuckDuckGo(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) return [];

      const html = await response.text();
      const results: SearchResult[] = [];

      const linkRegex = /<a[^>]*class="result-link"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

      const links: { url: string; title: string }[] = [];
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        links.push({ url: match[1], title: match[2].trim() });
      }

      const snippets: string[] = [];
      while ((match = snippetRegex.exec(html)) !== null) {
        snippets.push(match[1].replace(/<[^>]+>/g, '').trim());
      }

      for (let i = 0; i < Math.min(links.length, limit); i++) {
        results.push({
          url: links[i].url,
          title: links[i].title,
          snippet: snippets[i] ?? '',
        });
      }

      return results;
    } catch {
      return [];
    }
  }
}
