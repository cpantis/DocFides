/**
 * Header/footer placeholder replacement for DOCX export.
 * Processes word/header*.xml and word/footer*.xml files in the DOCX ZIP,
 * replacing placeholders while preserving font/size/alignment.
 * [Page] and [Total Pages] are native DOCX field codes — left untouched.
 */

import type JSZip from 'jszip';

export interface HeaderFooterReplacement {
  placeholder: string;
  value: string;
}

/**
 * Process all header and footer XML files in the DOCX ZIP.
 * Replaces placeholder text in <w:t> elements.
 */
export async function processHeadersFooters(
  zip: JSZip,
  replacements: HeaderFooterReplacement[]
): Promise<void> {
  if (replacements.length === 0) return;

  const files = Object.keys(zip.files);

  // Find header and footer XML files
  const headerFooterFiles = files.filter(
    (f) => /^word\/(header|footer)\d*\.xml$/.test(f)
  );

  for (const filePath of headerFooterFiles) {
    const file = zip.file(filePath);
    if (!file) continue;

    let xml = await file.async('string');

    for (const { placeholder, value } of replacements) {
      const escapedValue = escapeXml(value);
      xml = xml.replaceAll(placeholder, escapedValue);
    }

    zip.file(filePath, xml);
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
