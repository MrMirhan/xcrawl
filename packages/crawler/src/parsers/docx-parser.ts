import mammoth from 'mammoth';

export interface DocxResult {
  html: string;
  markdown: string;
  text: string;
}

/**
 * Parse a DOCX buffer into HTML, markdown, and plain text.
 */
export async function parseDocx(buffer: Buffer): Promise<DocxResult> {
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
    mammoth.extractRawText({ buffer }),
  ]);

  // Convert HTML to basic markdown
  const markdown = htmlToBasicMarkdown(htmlResult.value);

  return {
    html: htmlResult.value,
    markdown,
    text: textResult.value,
  };
}

/**
 * Simple HTML to markdown for DOCX output (no external dependency needed).
 */
function htmlToBasicMarkdown(html: string): string {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?ul>/gi, '\n')
    .replace(/<\/?ol>/gi, '\n')
    .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Check if a URL points to a DOCX file.
 */
export function isDocxUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.docx') || lower.endsWith('.doc');
}
