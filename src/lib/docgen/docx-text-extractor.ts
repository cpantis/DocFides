/**
 * Extract plain text from a DOCX buffer.
 * Used by the Export Agent to read the generated document for AI verification.
 */

import JSZip from 'jszip';

/**
 * Extract all text content from a DOCX buffer.
 * Returns a structured text with paragraph separators.
 */
export async function extractTextFromDocxBuffer(docxBuffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(docxBuffer);

  const parts: string[] = [];

  // Extract from main document
  const documentFile = zip.file('word/document.xml');
  if (documentFile) {
    const xml = await documentFile.async('string');
    parts.push(extractTextFromXml(xml));
  }

  // Extract from headers
  const headerFiles = Object.keys(zip.files).filter(
    (f) => /^word\/header\d*\.xml$/.test(f)
  );
  for (const hf of headerFiles) {
    const file = zip.file(hf);
    if (!file) continue;
    const xml = await file.async('string');
    const text = extractTextFromXml(xml);
    if (text.trim()) {
      parts.push(`[Header]\n${text}`);
    }
  }

  // Extract from footers
  const footerFiles = Object.keys(zip.files).filter(
    (f) => /^word\/footer\d*\.xml$/.test(f)
  );
  for (const ff of footerFiles) {
    const file = zip.file(ff);
    if (!file) continue;
    const xml = await file.async('string');
    const text = extractTextFromXml(xml);
    if (text.trim()) {
      parts.push(`[Footer]\n${text}`);
    }
  }

  return parts.join('\n\n');
}

/**
 * Extract text from OOXML content by collecting all <w:t> elements,
 * grouping by paragraphs (<w:p>) and table cells (<w:tc>).
 */
function extractTextFromXml(xml: string): string {
  const paragraphs: string[] = [];

  // Match paragraphs
  const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;

  while ((match = paraRegex.exec(xml)) !== null) {
    const paraXml = match[0];
    const texts: string[] = [];
    const textRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let textMatch: RegExpExecArray | null;

    while ((textMatch = textRegex.exec(paraXml)) !== null) {
      const text = textMatch[1] ?? '';
      if (text) texts.push(text);
    }

    const paraText = texts.join('');
    if (paraText.trim()) {
      paragraphs.push(unescapeXml(paraText));
    }
  }

  return paragraphs.join('\n');
}

function unescapeXml(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
