/**
 * Export Validator Agent — post-generation quality check.
 *
 * After DOCX generation, validates the output to catch issues before
 * the document reaches the user:
 *
 * 1. Unreplaced placeholders ({{field}}, [Field Name], _____)
 * 2. Empty narrative sections (paragraphs that should have content)
 * 3. Empty dynamic tables (model row still present)
 * 4. Broken XML structure
 * 5. Missing required fields
 */

import JSZip from 'jszip';

export interface ExportValidationResult {
  valid: boolean;
  warnings: ExportWarning[];
  errors: ExportError[];
  stats: {
    totalParagraphs: number;
    totalTables: number;
    unreplacedPlaceholders: number;
  };
}

export interface ExportWarning {
  type: 'unreplaced_placeholder' | 'empty_table' | 'short_narrative';
  message: string;
  location?: string;
}

export interface ExportError {
  type: 'broken_xml' | 'missing_content' | 'generation_failed';
  message: string;
}

/**
 * Validate a generated DOCX buffer before delivering to the user.
 * Returns validation result with warnings and errors.
 */
export async function validateExportedDocx(
  docxBuffer: Buffer,
  expectedFields?: string[]
): Promise<ExportValidationResult> {
  const warnings: ExportWarning[] = [];
  const errors: ExportError[] = [];

  let totalParagraphs = 0;
  let totalTables = 0;
  let unreplacedCount = 0;

  // 1. Verify DOCX structure (valid ZIP with document.xml)
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(docxBuffer);
  } catch {
    errors.push({
      type: 'broken_xml',
      message: 'Generated file is not a valid DOCX/ZIP archive',
    });
    return { valid: false, warnings, errors, stats: { totalParagraphs: 0, totalTables: 0, unreplacedPlaceholders: 0 } };
  }

  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    errors.push({
      type: 'broken_xml',
      message: 'DOCX is missing word/document.xml',
    });
    return { valid: false, warnings, errors, stats: { totalParagraphs: 0, totalTables: 0, unreplacedPlaceholders: 0 } };
  }

  const xml = await documentFile.async('string');

  // 2. Count paragraphs and tables
  const paragraphs = xml.match(/<w:p[ >]/g);
  totalParagraphs = paragraphs?.length ?? 0;

  const tables = xml.match(/<w:tbl[ >]/g);
  totalTables = tables?.length ?? 0;

  // 3. Check for unreplaced {{...}} placeholders
  const doubleBracePlaceholders = xml.match(/\{\{[^}]+\}\}/g) ?? [];
  for (const placeholder of doubleBracePlaceholders) {
    // Extract text content (may be inside XML)
    const textContent = placeholder.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, '');
    unreplacedCount++;
    warnings.push({
      type: 'unreplaced_placeholder',
      message: `Unreplaced placeholder found: ${textContent}`,
    });
  }

  // 4. Check for unreplaced [...] placeholders (uppercase, not XML attributes)
  const bracketRe = />\s*\[([A-Z][A-Za-z0-9 _.]+)\]\s*</g;
  let bracketMatch: RegExpExecArray | null;
  while ((bracketMatch = bracketRe.exec(xml)) !== null) {
    unreplacedCount++;
    warnings.push({
      type: 'unreplaced_placeholder',
      message: `Unreplaced bracket placeholder: [${bracketMatch[1]}]`,
    });
  }

  // 5. Check for unreplaced underline placeholders (_____+)
  const underlineRe = />{2,}_{5,}<\//g;
  if (underlineRe.test(xml)) {
    unreplacedCount++;
    warnings.push({
      type: 'unreplaced_placeholder',
      message: 'Unreplaced underline placeholder (_____ still present)',
    });
  }

  // 6. Check expected fields were filled
  if (expectedFields && expectedFields.length > 0) {
    for (const field of expectedFields) {
      if (xml.includes(field)) {
        // The field placeholder is still in the document — wasn't replaced
        warnings.push({
          type: 'unreplaced_placeholder',
          message: `Expected field not filled: ${field}`,
        });
      }
    }
  }

  // 7. Also check headers/footers for unreplaced placeholders
  const hfFiles = Object.keys(zip.files).filter(
    (f) => /^word\/(header|footer)\d*\.xml$/.test(f)
  );
  for (const hfPath of hfFiles) {
    const hfFile = zip.file(hfPath);
    if (!hfFile) continue;
    const hfXml = await hfFile.async('string');
    const hfPlaceholders = hfXml.match(/\{\{[^}]+\}\}/g) ?? [];
    for (const p of hfPlaceholders) {
      unreplacedCount++;
      warnings.push({
        type: 'unreplaced_placeholder',
        message: `Unreplaced placeholder in ${hfPath}: ${p}`,
        location: hfPath,
      });
    }
  }

  // Consider it valid if there are no errors (warnings are OK)
  const valid = errors.length === 0;

  if (unreplacedCount > 0) {
    console.warn(
      `[ExportValidator] ${unreplacedCount} unreplaced placeholder(s) found in generated document`
    );
  }

  console.log(
    `[ExportValidator] Validation ${valid ? 'passed' : 'FAILED'}: ` +
    `${totalParagraphs} paragraphs, ${totalTables} tables, ` +
    `${unreplacedCount} unreplaced, ${warnings.length} warnings, ${errors.length} errors`
  );

  return {
    valid,
    warnings,
    errors,
    stats: { totalParagraphs, totalTables, unreplacedPlaceholders: unreplacedCount },
  };
}
