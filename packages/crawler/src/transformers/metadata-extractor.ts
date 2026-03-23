import * as cheerio from 'cheerio';

export interface PageMetadata {
  title?: string;
  description?: string;
  language?: string;
  author?: string;
  keywords?: string[];
  canonical?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  favicon?: string;
  publishedTime?: string;
  modifiedTime?: string;
  jsonLd?: unknown[];
}

/**
 * Extract comprehensive metadata from HTML including OG tags,
 * Twitter cards, JSON-LD structured data, and more.
 */
export function extractFullMetadata(html: string, baseUrl: string): PageMetadata {
  const $ = cheerio.load(html);

  const meta: PageMetadata = {};

  // Basic
  meta.title = $('title').text().trim() || undefined;
  meta.description = getMeta($, 'description') || getMeta($, 'og:description');
  meta.language = $('html').attr('lang') || getMeta($, 'language') || undefined;
  meta.author = getMeta($, 'author');
  meta.robots = getMeta($, 'robots');

  // Keywords
  const keywords = getMeta($, 'keywords');
  if (keywords) {
    meta.keywords = keywords.split(',').map((k) => k.trim()).filter(Boolean);
  }

  // Canonical
  meta.canonical = $('link[rel="canonical"]').attr('href') || undefined;

  // Open Graph
  meta.ogTitle = getMeta($, 'og:title');
  meta.ogDescription = getMeta($, 'og:description');
  meta.ogImage = getMeta($, 'og:image');
  meta.ogType = getMeta($, 'og:type');
  meta.ogUrl = getMeta($, 'og:url');

  // Twitter Card
  meta.twitterCard = getMeta($, 'twitter:card');
  meta.twitterTitle = getMeta($, 'twitter:title');
  meta.twitterDescription = getMeta($, 'twitter:description');
  meta.twitterImage = getMeta($, 'twitter:image');

  // Favicon
  const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href');
  if (favicon) {
    try {
      meta.favicon = new URL(favicon, baseUrl).href;
    } catch {
      meta.favicon = favicon;
    }
  }

  // Dates
  meta.publishedTime = getMeta($, 'article:published_time') || getMeta($, 'datePublished');
  meta.modifiedTime = getMeta($, 'article:modified_time') || getMeta($, 'dateModified');

  // JSON-LD
  const jsonLd: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      jsonLd.push(data);
    } catch {
      // Invalid JSON-LD, skip
    }
  });
  if (jsonLd.length > 0) meta.jsonLd = jsonLd;

  // Clean undefined values
  return Object.fromEntries(
    Object.entries(meta).filter(([, v]) => v !== undefined),
  ) as PageMetadata;
}

function getMeta($: cheerio.CheerioAPI, name: string): string | undefined {
  return (
    $(`meta[name="${name}"]`).attr('content') ||
    $(`meta[property="${name}"]`).attr('content') ||
    undefined
  );
}
