import type { Page } from 'playwright';

/**
 * Common selectors for popups, cookie banners, and modals that block content.
 * Ordered by specificity — most reliable first.
 */
const DISMISS_BUTTON_SELECTORS = [
  // Cookie consent — accept/agree buttons
  'button[id*="accept" i]',
  'button[class*="accept" i]',
  'a[id*="accept" i]',
  '[class*="cookie"] button[class*="accept" i]',
  '[class*="cookie"] button[class*="agree" i]',
  '[class*="consent"] button[class*="accept" i]',
  '[class*="consent"] button[class*="agree" i]',
  '[id*="cookie-banner"] button',
  '[id*="cookie-consent"] button',
  '[class*="cookie-banner"] button:first-of-type',
  '[data-testid*="cookie"] button',
  '[aria-label*="cookie" i] button',
  '[aria-label*="consent" i] button',

  // GDPR specific
  '[class*="gdpr" i] button[class*="accept" i]',
  '[class*="privacy" i] button[class*="accept" i]',
  '#onetrust-accept-btn-handler',
  '.onetrust-close-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '[data-cookiefirst-action="accept"]',

  // Generic close buttons on modals/overlays
  '[class*="modal"] [class*="close" i]',
  '[class*="modal"] button[aria-label*="close" i]',
  '[class*="overlay"] [class*="close" i]',
  '[class*="popup"] [class*="close" i]',
  '[class*="popup"] button[aria-label*="close" i]',
  '[role="dialog"] button[aria-label*="close" i]',
  '[role="dialog"] [class*="close" i]',

  // Newsletter/signup dismiss
  '[class*="newsletter" i] [class*="close" i]',
  '[class*="signup" i] [class*="close" i]',
  '[class*="subscribe" i] [class*="close" i]',
];

/**
 * Selectors for overlay/backdrop elements to check if they're blocking content.
 */
const OVERLAY_SELECTORS = [
  '[class*="overlay" i]',
  '[class*="backdrop" i]',
  '[class*="modal-backdrop" i]',
  '.fixed.inset-0',
];

/**
 * Attempt to dismiss popups, cookie banners, and modals on the page.
 * Tries each known selector and clicks the first match found.
 * Gracefully handles errors (selector not found, element not clickable, etc.)
 */
export async function dismissPopups(page: Page): Promise<number> {
  let dismissed = 0;

  for (const selector of DISMISS_BUTTON_SELECTORS) {
    try {
      const element = await page.$(selector);
      if (element) {
        const isVisible = await element.isVisible();
        if (isVisible) {
          await element.click({ timeout: 2000 });
          dismissed++;
          // Wait briefly for the popup to animate away
          await page.waitForTimeout(300);
        }
      }
    } catch {
      // Element not clickable or already gone — continue
    }
  }

  // If no buttons worked, try pressing Escape to close modals
  if (dismissed === 0) {
    try {
      const hasOverlay = await page.$(OVERLAY_SELECTORS.join(', '));
      if (hasOverlay) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        dismissed++;
      }
    } catch {
      // No overlay found
    }
  }

  return dismissed;
}
