import * as cheerio from 'cheerio';

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const absoluteUrl = new URL(href, baseUrl).href;
      // Filter out non-http links
      if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
        links.add(absoluteUrl.split('#')[0]); // remove fragment
      }
    } catch {
      // Invalid URL, skip
    }
  });

  return Array.from(links);
}

export function extractImages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const images = new Set<string>();

  $('img[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    try {
      const absoluteUrl = new URL(src, baseUrl).href;
      if (absoluteUrl.startsWith('http://') || absoluteUrl.startsWith('https://')) {
        images.add(absoluteUrl);
      }
    } catch {
      // Invalid URL, skip
    }
  });

  return Array.from(images);
}

export function extractMetadata(html: string): {
  title?: string;
  description?: string;
  language?: string;
} {
  const $ = cheerio.load(html);
  return {
    title: $('title').text() || $('meta[property="og:title"]').attr('content') || undefined,
    description:
      $('meta[name="description"]').attr('content') ||
      $('meta[property="og:description"]').attr('content') ||
      undefined,
    language: $('html').attr('lang') || undefined,
  };
}
