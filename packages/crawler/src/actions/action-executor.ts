import type { Page } from 'playwright';
import type { BrowserActionInput } from '../types.js';

export async function executeActions(page: Page, actions: BrowserActionInput[]): Promise<string[]> {
  const screenshots: string[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'click':
        if (action.selector) {
          await page.click(action.selector);
        }
        break;

      case 'type':
        if (action.selector && action.text) {
          await page.fill(action.selector, action.text);
        }
        break;

      case 'scroll':
        if (action.direction === 'up') {
          await page.evaluate(() => window.scrollBy(0, -500));
        } else {
          await page.evaluate(() => window.scrollBy(0, 500));
        }
        break;

      case 'wait':
        if (action.milliseconds) {
          await page.waitForTimeout(action.milliseconds);
        }
        break;

      case 'waitForSelector':
        if (action.selector) {
          await page.waitForSelector(action.selector, { timeout: 10_000 });
        }
        break;

      case 'screenshot': {
        const buffer = await page.screenshot({ fullPage: true });
        screenshots.push(buffer.toString('base64'));
        break;
      }

      case 'executeJavascript':
        if (action.code) {
          await page.evaluate(action.code);
        }
        break;
    }
  }

  return screenshots;
}
