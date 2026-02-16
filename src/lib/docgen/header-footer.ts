/**
 * Header/footer placeholder replacement for DOCX export.
 * Processes word/header*.xml and word/footer*.xml files in the DOCX ZIP,
 * replacing placeholders while preserving font/size/alignment.
 *
 * Uses the same split-run merging logic as template-filler to handle
 * Word's tendency to split {{placeholder}} across multiple <w:r> elements.
 *
 * [Page] and [Total Pages] are native DOCX field codes — left untouched.
 */

import type JSZip from 'jszip';
import { replaceTextPlaceholders, type PlaceholderReplacement } from './template-filler';

export interface HeaderFooterReplacement {
  placeholder: string;
  value: string;
}

/**
 * Process all header and footer XML files in the DOCX ZIP.
 * Merges split runs and replaces placeholder text in <w:t> elements.
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

  // Convert to PlaceholderReplacement format (headers are never narrative)
  const placeholderReplacements: PlaceholderReplacement[] = replacements.map(
    ({ placeholder, value }) => ({ placeholder, value, isNarrative: false })
  );

  for (const filePath of headerFooterFiles) {
    const file = zip.file(filePath);
    if (!file) continue;

    let xml = await file.async('string');

    // Use the same merge+replace logic as template-filler
    // This handles split-run placeholders that simple replaceAll would miss
    xml = replaceTextPlaceholders(xml, placeholderReplacements);

    zip.file(filePath, xml);
  }
}
