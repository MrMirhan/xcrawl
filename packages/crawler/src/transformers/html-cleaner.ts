import * as cheerio from 'cheerio';

const REMOVE_TAGS = ['script', 'style', 'noscript', 'iframe', 'svg'];
const REMOVE_ATTRS = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur'];

export function cleanHtml(
  html: string,
  options?: { includeTags?: string[]; excludeTags?: string[] },
): string {
  const $ = cheerio.load(html);

  // Always remove unsafe tags; optionally remove additional caller-specified tags
  const tagsToRemove = options?.excludeTags
    ? [...new Set([...REMOVE_TAGS, ...options.excludeTags])]
    : REMOVE_TAGS;
  tagsToRemove.forEach((tag) => $(tag).remove());

  // Remove event handler attributes
  REMOVE_ATTRS.forEach((attr) => $(`[${attr}]`).removeAttr(attr));

  // If includeTags specified, extract only those
  if (options?.includeTags && options.includeTags.length > 0) {
    const content = options.includeTags
      .map((tag) => $(tag).html())
      .filter(Boolean)
      .join('\n');
    return content || $.html() || '';
  }

  return $.html() || '';
}
