import { Sitemap } from 'crawlee';

export async function parseSitemap(url: string): Promise<string[]> {
  try {
    // Try direct sitemap URL first
    const sitemapUrl = url.endsWith('/sitemap.xml') ? url : `${url.replace(/\/$/, '')}/sitemap.xml`;
    const { urls } = await Sitemap.load(sitemapUrl);
    return urls;
  } catch {
    return [];
  }
}

export async function discoverSitemapUrls(baseUrl: string): Promise<string[]> {
  const allUrls: string[] = [];

  // Try common sitemap locations
  const candidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap/sitemap.xml`,
  ];

  for (const candidate of candidates) {
    try {
      const { urls } = await Sitemap.load(candidate);
      allUrls.push(...urls);
      if (urls.length > 0) break; // found a working sitemap
    } catch {
      continue;
    }
  }

  return [...new Set(allUrls)];
}
