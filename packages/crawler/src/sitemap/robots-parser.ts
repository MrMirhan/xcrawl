/**
 * Parse robots.txt and extract rules + sitemap URLs.
 */
export interface RobotsRules {
  allowed: string[];
  disallowed: string[];
  sitemaps: string[];
  crawlDelay?: number;
}

export async function parseRobotsTxt(baseUrl: string): Promise<RobotsRules> {
  const rules: RobotsRules = {
    allowed: [],
    disallowed: [],
    sitemaps: [],
  };

  try {
    const robotsUrl = `${baseUrl.replace(/\/$/, '')}/robots.txt`;
    const response = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'XCrawl/1.0' },
    });

    if (!response.ok) return rules;

    const text = await response.text();
    let inRelevantBlock = false;

    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const [directive, ...valueParts] = line.split(':');
      const key = directive.trim().toLowerCase();
      const value = valueParts.join(':').trim();

      if (key === 'user-agent') {
        inRelevantBlock = value === '*' || value.toLowerCase().includes('xcrawl');
        continue;
      }

      // Sitemaps are global (not user-agent specific)
      if (key === 'sitemap' && value) {
        rules.sitemaps.push(value);
        continue;
      }

      if (!inRelevantBlock) continue;

      if (key === 'allow' && value) {
        rules.allowed.push(value);
      } else if (key === 'disallow' && value) {
        rules.disallowed.push(value);
      } else if (key === 'crawl-delay' && value) {
        const delay = parseFloat(value);
        if (!isNaN(delay)) rules.crawlDelay = delay;
      }
    }
  } catch {
    // robots.txt not available — allow everything
  }

  return rules;
}

/**
 * Check if a URL is allowed by robots.txt rules.
 */
export function isUrlAllowed(url: string, rules: RobotsRules): boolean {
  const path = new URL(url).pathname;

  // Check disallowed first
  for (const pattern of rules.disallowed) {
    if (pathMatches(path, pattern)) {
      // But check if there's a more specific allow rule
      for (const allowPattern of rules.allowed) {
        if (allowPattern.length > pattern.length && pathMatches(path, allowPattern)) {
          return true;
        }
      }
      return false;
    }
  }

  return true;
}

function pathMatches(path: string, pattern: string): boolean {
  // Handle wildcard patterns
  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('^' + escaped.replace(/\*/g, '.*').replace(/\\\$/g, '$'));
    return regex.test(path);
  }
  return path.startsWith(pattern);
}
