/**
 * Rewrite URLs to more scraping-friendly alternatives.
 * Many popular sites have versions that are easier to scrape.
 */

interface RewriteRule {
  pattern: RegExp;
  rewrite: (url: string, match: RegExpMatchArray) => string;
  description: string;
}

const REWRITE_RULES: RewriteRule[] = [
  // Reddit → old.reddit.com (no JS required, no anti-bot)
  {
    pattern: /^https?:\/\/(www\.)?reddit\.com\//,
    rewrite: (url) => url.replace(/^https?:\/\/(www\.)?reddit\.com\//, 'https://old.reddit.com/'),
    description: 'Reddit → old.reddit.com',
  },
  // Twitter/X → try without JS-heavy SPA
  {
    pattern: /^https?:\/\/(www\.)?(twitter|x)\.com\//,
    rewrite: (url) => {
      // Use nitter if available, otherwise try syndication API
      const nitterUrl = url
        .replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//, 'https://nitter.net/');
      return nitterUrl;
    },
    description: 'Twitter/X → Nitter',
  },
  // Instagram → append ?__a=1 for JSON API (may not work, but worth trying)
  {
    pattern: /^https?:\/\/(www\.)?instagram\.com\/p\//,
    rewrite: (url) => url.includes('?') ? url : `${url}?__a=1`,
    description: 'Instagram → JSON API',
  },
  // Medium → scribe.rip (reader-friendly proxy)
  {
    pattern: /^https?:\/\/(www\.)?medium\.com\//,
    rewrite: (url) => url.replace(/^https?:\/\/(www\.)?medium\.com\//, 'https://scribe.rip/'),
    description: 'Medium → Scribe.rip',
  },
  // Medium custom domains → add ?source=post_page to skip paywall
  {
    pattern: /^https?:\/\/[^/]+\.medium\.com\//,
    rewrite: (url) => url.includes('?') ? url : `${url}?source=post_page`,
    description: 'Medium custom domain → add source param',
  },
];

/**
 * Try to rewrite a URL to a more scraping-friendly version.
 * Returns the rewritten URL if a rule matches, otherwise returns the original.
 */
export function rewriteUrl(url: string): { url: string; rewritten: boolean; description?: string } {
  for (const rule of REWRITE_RULES) {
    const match = url.match(rule.pattern);
    if (match) {
      const rewritten = rule.rewrite(url, match);
      if (rewritten !== url) {
        return { url: rewritten, rewritten: true, description: rule.description };
      }
    }
  }
  return { url, rewritten: false };
}

/**
 * Try to get an archived version of a URL from the Wayback Machine.
 * Returns null if no archive is available.
 */
export async function getArchivedUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;

    const data = await response.json() as {
      archived_snapshots?: { closest?: { url?: string; available?: boolean } };
    };

    if (data.archived_snapshots?.closest?.available && data.archived_snapshots.closest.url) {
      return data.archived_snapshots.closest.url;
    }
    return null;
  } catch {
    return null;
  }
}
