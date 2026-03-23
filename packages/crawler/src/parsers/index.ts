export { parsePdf, isPdfUrl, type PdfResult } from './pdf-parser.js';
export { parseDocx, isDocxUrl, type DocxResult } from './docx-parser.js';

/**
 * Detect document type from URL and content-type header.
 */
export function detectDocumentType(url: string, contentType?: string): 'pdf' | 'docx' | 'html' | null {
  const lower = url.toLowerCase();

  if (lower.endsWith('.pdf') || lower.includes('.pdf?') || contentType?.includes('application/pdf')) {
    return 'pdf';
  }
  if (lower.endsWith('.docx') || lower.endsWith('.doc') ||
      contentType?.includes('application/vnd.openxmlformats-officedocument') ||
      contentType?.includes('application/msword')) {
    return 'docx';
  }
  if (contentType?.includes('text/html') || lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'html';
  }

  return null;
}
