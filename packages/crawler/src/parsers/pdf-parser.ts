import pdf from 'pdf-parse';

export interface PdfResult {
  text: string;
  markdown: string;
  metadata: {
    pages: number;
    title?: string;
    author?: string;
    creator?: string;
  };
}

/**
 * Parse a PDF buffer into text and markdown.
 */
export async function parsePdf(buffer: Buffer): Promise<PdfResult> {
  const data = await pdf(buffer);

  // Convert to basic markdown (paragraphs separated by double newlines)
  const markdown = data.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((p) => p.length > 0)
    .join('\n\n');

  return {
    text: data.text,
    markdown,
    metadata: {
      pages: data.numpages,
      title: data.info?.Title || undefined,
      author: data.info?.Author || undefined,
      creator: data.info?.Creator || undefined,
    },
  };
}

/**
 * Check if a URL points to a PDF file.
 */
export function isPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith('.pdf') || lower.includes('.pdf?') || lower.includes('/pdf/');
}
