/**
 * Conditional section evaluation and removal for DOCX export.
 * Omits sections cleanly when conditions aren't met:
 * removes heading + content paragraphs + adjusts section numbering.
 */

export interface ConditionalSection {
  sectionId: string;
  condition: string;
  includeHeading: boolean;
  headingText?: string;
}

/**
 * Process conditional sections in DOCX XML.
 * Sections whose conditions evaluate to false are removed entirely,
 * including their heading paragraph and all content until the next heading
 * of the same or higher level.
 */
export function processConditionalSections(
  xml: string,
  sections: ConditionalSection[],
  projectData: Record<string, unknown>
): string {
  let result = xml;

  // Process each conditional section
  for (const section of sections) {
    const shouldInclude = evaluateCondition(section.condition, projectData);
    if (shouldInclude) continue;

    // Find and remove the section
    if (section.headingText) {
      result = removeSectionByHeading(result, section.headingText, section.includeHeading);
    }
  }

  // Renumber remaining sections if needed
  result = renumberHeadings(result);

  return result;
}

/**
 * Evaluate a condition string against project data.
 * Supports: "path.to.value > 0", "path.to.value == 'string'",
 *           "path.to.array.length > 0", "path.to.flag != false"
 */
export function evaluateCondition(
  condition: string,
  projectData: Record<string, unknown>
): boolean {
  try {
    const parts = condition.split(' ');
    if (parts.length !== 3) return false;

    const [path, operator, rawValue] = parts;
    const value = getNestedValue(projectData, path!);
    const compareValue = Number(rawValue);

    switch (operator) {
      case '>': return Number(value) > compareValue;
      case '<': return Number(value) < compareValue;
      case '>=': return Number(value) >= compareValue;
      case '<=': return Number(value) <= compareValue;
      case '==': return String(value) === rawValue;
      case '!=': return String(value) !== rawValue;
      default: return false;
    }
  } catch {
    return false;
  }
}

/**
 * Remove a section from XML by finding its heading paragraph and removing
 * all content until the next heading of the same or higher level.
 */
function removeSectionByHeading(
  xml: string,
  headingText: string,
  includeHeading: boolean
): string {
  // Find all paragraphs
  const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const paragraphs: { match: string; index: number; end: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = paragraphRegex.exec(xml)) !== null) {
    paragraphs.push({
      match: m[0],
      index: m.index,
      end: m.index + m[0].length,
    });
  }

  // Find the heading paragraph containing the target text
  let headingIdx = -1;
  let headingLevel = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    const level = getHeadingLevel(p.match);
    if (level > 0 && extractParagraphText(p.match).includes(headingText)) {
      headingIdx = i;
      headingLevel = level;
      break;
    }
  }

  if (headingIdx === -1) return xml;

  // Find the end of the section: next heading of same or higher level
  let endIdx = paragraphs.length; // default: to end of document
  for (let i = headingIdx + 1; i < paragraphs.length; i++) {
    const level = getHeadingLevel(paragraphs[i]!.match);
    if (level > 0 && level <= headingLevel) {
      endIdx = i;
      break;
    }
  }

  // Determine removal range
  const startParagraph = includeHeading ? headingIdx : headingIdx + 1;
  if (startParagraph >= endIdx) return xml;

  const removeStart = paragraphs[startParagraph]!.index;
  const removeEnd = paragraphs[endIdx - 1]!.end;

  return xml.substring(0, removeStart) + xml.substring(removeEnd);
}

/**
 * Get the heading level (1-9) from a paragraph's style.
 * Returns 0 if not a heading.
 */
function getHeadingLevel(paragraphXml: string): number {
  // Check for <w:pStyle w:val="Heading1"/> or <w:pStyle w:val="Heading2"/> etc.
  const styleMatch = /<w:pStyle\s+w:val="Heading(\d)"/.exec(paragraphXml);
  if (styleMatch) return parseInt(styleMatch[1]!, 10);

  // Check for <w:outlineLvl w:val="0"/> (0-based)
  const outlineMatch = /<w:outlineLvl\s+w:val="(\d)"/.exec(paragraphXml);
  if (outlineMatch) return parseInt(outlineMatch[1]!, 10) + 1;

  return 0;
}

/**
 * Extract text content from a paragraph's <w:t> elements.
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
 * Renumber sequential headings after sections have been removed.
 * Handles "1.", "2.", "3." etc. at the start of heading text.
 */
function renumberHeadings(xml: string): string {
  const counters: Record<number, number> = {};

  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => {
    const level = getHeadingLevel(paragraph);
    if (level === 0) return paragraph;

    const text = extractParagraphText(paragraph);
    const numberMatch = /^(\d+)\.\s/.exec(text);
    if (!numberMatch) return paragraph;

    // Increment counter for this level, reset sub-levels
    counters[level] = (counters[level] ?? 0) + 1;
    for (let l = level + 1; l <= 9; l++) {
      delete counters[l];
    }

    const oldNumber = numberMatch[1]!;
    const newNumber = String(counters[level]);

    if (oldNumber === newNumber) return paragraph;

    // Replace the number in the text
    return paragraph.replace(
      new RegExp(`(>)${oldNumber}\\.\\s`),
      `$1${newNumber}. `
    );
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
