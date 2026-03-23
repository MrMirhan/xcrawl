import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export interface ReadabilityResult {
  title: string;
  content: string; // cleaned HTML
  textContent: string;
  length: number;
  excerpt: string;
  siteName: string | null;
}

export function extractMainContent(html: string, url: string): ReadabilityResult | null {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) return null;

  return {
    title: article.title,
    content: article.content,
    textContent: article.textContent,
    length: article.length,
    excerpt: article.excerpt,
    siteName: article.siteName,
  };
}
