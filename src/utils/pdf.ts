// PDF text extraction utility for React Native + Hermes.
// Uses pdfjs-dist v3 legacy build (CommonJS, no dynamic import()).
// The worker is bundled as a main-thread module via pdfjsWorker global,
// so no Web Worker API is needed.

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf';
// Import the worker module — this sets `globalThis.pdfjsWorker.WorkerMessageHandler`,
// which pdfjs-dist picks up as the "main thread worker" (FakeWorker path).
import 'pdfjs-dist/legacy/build/pdf.worker';

// Non-empty dummy value passes pdfjs-dist's workerSrc check; since
// `Worker` is undefined in React Native, pdfjs-dist uses the main-thread
// WorkerMessageHandler we registered via the pdf.worker import above.
GlobalWorkerOptions.workerSrc = 'pdf.worker.js';

interface PdfTextExtractionOptions {
  onProgress?: (page: number, total: number) => void;
}

/**
 * Extracts the full text content of a PDF file (all pages, concatenated
 * with newlines between pages). The file must already be available as a
 * Uint8Array (e.g. read via fetch or expo-file-system).
 */
export async function extractPdfText(
  data: Uint8Array,
  options?: PdfTextExtractionOptions
): Promise<string> {
  const doc = await getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;

  const pages: string[] = [];
  const total = doc.numPages;
  console.log('[PDF] Pages:', total);

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    console.log(`[PDF] Page ${i}: ${content.items.length} text items`);
    // Reconstruct lines: pdfjs-dist items have hasEOL flag that marks
    // end-of-line, so we join with newline at EOL markers and space otherwise.
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (item && typeof item === 'object' && 'str' in item) {
        line += (item as { str: string }).str;
      }
      if (item && typeof item === 'object' && 'hasEOL' in item && (item as { hasEOL: boolean }).hasEOL) {
        lines.push(line);
        line = '';
      }
    }
    if (line) lines.push(line);
    console.log(`[PDF] Page ${i}: ${lines.length} lines`);
    if (i === 1) {
      console.log('[PDF] Page 1 first 5 lines:', JSON.stringify(lines.slice(0, 5)));
    }
    pages.push(lines.join('\n'));
    options?.onProgress?.(i, total);
  }

  const result = pages.join('\n');
  console.log('[PDF] Total text length:', result.length);
  console.log('[PDF] First 300 chars:', result.slice(0, 300));
  return result;
}
