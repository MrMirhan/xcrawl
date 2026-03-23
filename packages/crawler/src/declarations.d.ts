declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export function gfm(service: TurndownService): void;
  export function tables(service: TurndownService): void;
  export function strikethrough(service: TurndownService): void;
}

declare module 'pdf-parse' {
  interface PdfData {
    numpages: number;
    numrender: number;
    info: Record<string, string>;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdf(buffer: Buffer, options?: Record<string, unknown>): Promise<PdfData>;
  export = pdf;
}
