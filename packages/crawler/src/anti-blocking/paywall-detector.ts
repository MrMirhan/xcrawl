/**
 * Detect if a page is behind a paywall or login wall.
 */
export interface PaywallResult {
  isPaywalled: boolean;
  reason: string;
}

/**
 * Paywall indicator patterns — check both CSS selectors in HTML and text content.
 */
const PAYWALL_SELECTORS = [
  '[class*="paywall" i]',
  '[id*="paywall" i]',
  '[class*="subscribe-wall" i]',
  '[class*="premium-wall" i]',
  '[class*="meter-" i]',
  '[data-paywall]',
];

const PAYWALL_TEXT_PATTERNS = [
  'subscribe to read',
  'subscribe to continue',
  'subscription required',
  'this content is for subscribers',
  'this article is for subscribers',
  'this story is for subscribers',
  'sign in to read',
  'sign in to continue',
  'log in to read',
  'log in to continue',
  'create a free account',
  'become a member',
  'premium content',
  'premium article',
  'you\'ve reached your limit',
  'free articles remaining',
  'to continue reading',
  'unlock this article',
  'get unlimited access',
  'start your free trial',
  'already a subscriber',
  'members only',
  'exclusive content',
];

/**
 * Detect if page content appears to be behind a paywall.
 * Checks HTTP status, HTML selectors, and text patterns.
 */
export function detectPaywall(html: string, statusCode?: number): PaywallResult {
  // HTTP 402 Payment Required
  if (statusCode === 402) {
    return { isPaywalled: true, reason: 'HTTP 402 Payment Required' };
  }

  const lowerHtml = html.toLowerCase();

  // Check for paywall CSS selectors in the HTML
  for (const selector of PAYWALL_SELECTORS) {
    // Extract the attribute name and value from the selector
    const match = selector.match(/\[(\w+)\*="([^"]+)"/i);
    if (match) {
      const [, attr, value] = match;
      if (lowerHtml.includes(`${attr}=`) && lowerHtml.includes(value.toLowerCase())) {
        return { isPaywalled: true, reason: `Paywall element detected: ${selector}` };
      }
    }
  }

  // Check text content patterns — only match if the content is short
  // (long content with these phrases is likely not paywalled)
  const textLength = html.replace(/<[^>]*>/g, '').trim().length;

  if (textLength < 3000) {
    for (const pattern of PAYWALL_TEXT_PATTERNS) {
      if (lowerHtml.includes(pattern)) {
        return { isPaywalled: true, reason: `Paywall text: "${pattern}"` };
      }
    }
  }

  return { isPaywalled: false, reason: '' };
}
