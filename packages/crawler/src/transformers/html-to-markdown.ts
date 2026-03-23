import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

let turndownInstance: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownInstance) {
    turndownInstance = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });
    turndownInstance.use(gfm);

    // Remove script/style tags completely
    turndownInstance.remove(['script', 'style', 'noscript', 'iframe']);
  }
  return turndownInstance;
}

export function htmlToMarkdown(html: string): string {
  return getTurndown().turndown(html);
}
