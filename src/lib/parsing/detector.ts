/**
 * Document type detection — Node.js side.
 * Calls the Python parsing service for actual parsing.
 */

export type DocumentCategory = 'image' | 'pdf_native' | 'pdf_scanned' | 'docx' | 'xlsx' | 'unknown';

const PARSING_SERVICE_URL = process.env.PARSING_SERVICE_URL || 'http://localhost:8000';

export async function parseDocument(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string
): Promise<Record<string, unknown>> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  formData.append('file', blob, filename);

  const response = await fetch(`${PARSING_SERVICE_URL}/parse`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Parsing service error: ${response.status} ${error}`);
  }

  return response.json();
}

export async function checkParsingServiceHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${PARSING_SERVICE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
