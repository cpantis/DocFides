/**
 * Document parsing client — calls the Python parsing service.
 */

import type { ParseResponse } from './types';
import { normalizeParseResponse } from './merger';

export type DocumentCategory = 'image' | 'pdf_native' | 'pdf_scanned' | 'docx' | 'xlsx' | 'unknown';

const PARSING_SERVICE_URL = process.env.PARSING_SERVICE_URL || 'http://localhost:8000';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 45000]; // exponential backoff

export async function parseDocument(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParseResponse> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  formData.append('file', blob, filename);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${PARSING_SERVICE_URL}/parse`, {
        method: 'POST',
        body: formData,
      });

      if (response.status === 429) {
        // Rate limited — wait and retry
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '5', 10);
        await sleep(retryAfter * 1000);
        continue;
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Parsing service error: ${response.status} ${error}`);
      }

      const raw = await response.json() as Record<string, unknown>;
      return normalizeParseResponse(raw);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] ?? 5000;
        console.warn(`[PARSING] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, lastError.message);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Parsing failed after retries');
}

export async function checkParsingServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PARSING_SERVICE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
