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

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: unknown) =>
        item && typeof item === 'object' && 'str' in item ? (item as { str: string }).str : ''
      )
      .join(' ');
    pages.push(pageText);
    options?.onProgress?.(i, total);
  }

  return pages.join('\n');
}
