/**
 * DOCX template placeholder replacement.
 * Works at the XML level to handle placeholders split across text runs.
 * Supports patterns: {{field}}, [Field Name], and _____ underline placeholders.
 *
 * For narrative fields (Markdown content), replaces the entire containing
 * paragraph with multiple OOXML paragraphs that inherit the template's style.
 */

import { markdownToOoxml, type NarrativeStyleContext } from './markdown-to-ooxml';

export interface PlaceholderReplacement {
  placeholder: string;
  value: string;
  /** If true, value is Markdown — converted to multi-paragraph OOXML inheriting template style */
  isNarrative?: boolean;
}

/**
 * Replace placeholders in DOCX XML content.
 * Handles the common case where Word splits a placeholder like {{name}}
 * across multiple <w:r> (run) elements, e.g. <w:t>{{</w:t><w:t>name</w:t><w:t>}}</w:t>.
 *
 * For narrative replacements (isNarrative=true), the entire containing paragraph
 * is replaced with multiple OOXML paragraphs generated from Markdown content,
 * inheriting the template's font, size, color, and paragraph style.
 */
export function replaceTextPlaceholders(
  xml: string,
  replacements: PlaceholderReplacement[]
): string {
  let result = xml;

  // First pass: merge split runs so placeholders are in single <w:t> elements
  result = mergeSplitPlaceholders(result);

  // Separate narrative replacements from simple ones
  const narratives = replacements.filter((r) => r.isNarrative);
  const simple = replacements.filter((r) => !r.isNarrative);

  // Second pass: handle narrative replacements (replace entire paragraphs)
  for (const { placeholder, value } of narratives) {
    result = replaceNarrativePlaceholder(result, placeholder, value);
  }

  // Third pass: do simple text replacements in <w:t> elements
  for (const { placeholder, value } of simple) {
    const escapedValue = escapeXml(value);
    result = result.replaceAll(placeholder, escapedValue);
  }

  return result;
}

/**
 * Replace a narrative placeholder by substituting the entire containing paragraph
 * with Markdown-generated OOXML paragraphs that inherit the template's style.
 */
function replaceNarrativePlaceholder(
  xml: string,
  placeholder: string,
  markdownValue: string
): string {
  // Find the paragraph containing this placeholder
  const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;

  while ((match = paragraphRegex.exec(xml)) !== null) {
    const paragraph = match[0];
    if (!paragraph.includes(placeholder)) continue;

    // Extract style context from the template paragraph
    const styleContext = extractStyleContext(paragraph);

    // Convert Markdown to OOXML paragraphs inheriting the template style
    const ooxmlParagraphs = markdownToOoxml(markdownValue, styleContext);

    // Replace the entire paragraph with the generated paragraphs
    xml =
      xml.substring(0, match.index) +
      ooxmlParagraphs +
      xml.substring(match.index + paragraph.length);

    // Only replace first occurrence — each placeholder is unique
    break;
  }

  return xml;
}

/**
 * Extract run properties (<w:rPr>) and paragraph properties (<w:pPr>)
 * from a template paragraph to use as style context for generated content.
 */
function extractStyleContext(paragraphXml: string): NarrativeStyleContext {
  const context: NarrativeStyleContext = {};

  // Extract paragraph properties <w:pPr>...</w:pPr>
  const pPrMatch = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraphXml);
  if (pPrMatch) {
    context.paragraphProperties = pPrMatch[0];
  }

  // Extract run properties from the first <w:r> that contains the placeholder
  // This gives us the font, size, color, etc. of the placeholder text
  const rPrMatch = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(paragraphXml);
  if (rPrMatch) {
    context.runProperties = rPrMatch[0];
  }

  return context;
}

/**
 * Merge text runs that contain parts of a placeholder.
 * Word often splits {{placeholder}} into separate runs:
 *   <w:r><w:t>{</w:t></w:r><w:r><w:t>{field}</w:t></w:r><w:r><w:t>}</w:t></w:r>
 *
 * This function detects paragraphs containing placeholder markers and
 * merges the text content so placeholders are whole.
 */
function mergeSplitPlaceholders(xml: string): string {
  // Find paragraphs that might have split placeholders
  // A paragraph is <w:p ...>...</w:p>
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => {
    // Check if this paragraph has any placeholder markers
    const hasDoubleBraces = paragraph.includes('{{') || paragraph.includes('}}');
    const hasBrackets = paragraph.includes('[') && paragraph.includes(']');

    if (!hasDoubleBraces && !hasBrackets) return paragraph;

    // Extract all text from <w:t> elements to check for split placeholders
    const fullText = extractParagraphText(paragraph);

    // Check if the full text contains complete placeholders
    const hasSplitPlaceholder =
      (fullText.includes('{{') && fullText.includes('}}')) ||
      (fullText.includes('[') && fullText.includes(']'));

    if (!hasSplitPlaceholder) return paragraph;

    // Merge adjacent text runs that form placeholders
    return mergeRunsInParagraph(paragraph);
  });
}

/**
 * Extract all text content from a paragraph's <w:t> elements.
 */
function extractParagraphText(paragraph: string): string {
  const texts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(paragraph)) !== null) {
    texts.push(match[1] ?? '');
  }
  return texts.join('');
}

/**
 * Merge text runs in a paragraph so that placeholders are whole.
 * Keeps the formatting of the first run in a merged group.
 */
function mergeRunsInParagraph(paragraph: string): string {
  // Collect all runs with their positions
  const runRegex = /<w:r[ >][\s\S]*?<\/w:r>/g;
  const runs: { fullMatch: string; text: string; start: number; end: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = runRegex.exec(paragraph)) !== null) {
    const textMatch = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/.exec(match[0]);
    runs.push({
      fullMatch: match[0],
      text: textMatch ? (textMatch[1] ?? '') : '',
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (runs.length <= 1) return paragraph;

  // Build concatenated text and find placeholder boundaries
  const concatenated = runs.map((r) => r.text).join('');
  const placeholderRanges = findPlaceholderRanges(concatenated);

  if (placeholderRanges.length === 0) return paragraph;

  // Map character positions back to run indices
  const mergeGroups: { startRun: number; endRun: number; text: string }[] = [];

  for (const range of placeholderRanges) {
    let charPos = 0;
    let startRun = -1;
    let endRun = -1;

    for (let i = 0; i < runs.length; i++) {
      const runLen = runs[i]!.text.length;
      if (startRun === -1 && charPos + runLen > range.start) {
        startRun = i;
      }
      if (charPos + runLen >= range.end) {
        endRun = i;
        break;
      }
      charPos += runLen;
    }

    if (startRun !== -1 && endRun !== -1 && startRun !== endRun) {
      // These runs need merging
      const mergedText = runs
        .slice(startRun, endRun + 1)
        .map((r) => r.text)
        .join('');
      mergeGroups.push({ startRun, endRun, text: mergedText });
    }
  }

  if (mergeGroups.length === 0) return paragraph;

  // Apply merges in reverse order to preserve positions
  let result = paragraph;
  for (let g = mergeGroups.length - 1; g >= 0; g--) {
    const group = mergeGroups[g]!;
    const firstRun = runs[group.startRun]!;
    const lastRun = runs[group.endRun]!;

    // Replace the text in the first run, remove the rest
    const updatedFirstRun = firstRun.fullMatch.replace(
      /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/,
      `<w:t xml:space="preserve">${group.text}</w:t>`
    );

    const before = result.substring(0, firstRun.start);
    const after = result.substring(lastRun.end);
    result = before + updatedFirstRun + after;
  }

  return result;
}

/**
 * Find start/end character positions of placeholder patterns.
 */
function findPlaceholderRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];

  // Find {{...}} placeholders
  const doubleBraceRe = /\{\{[^}]+\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = doubleBraceRe.exec(text)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }

  // Find [...] placeholders (but not XML attributes)
  const bracketRe = /\[[A-Z][A-Za-z0-9 _.]+\]/g;
  while ((m = bracketRe.exec(text)) !== null) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
  }

  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * Escape special XML characters in replacement values.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
