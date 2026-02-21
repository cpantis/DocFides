/**
 * Markdown-to-OOXML converter for narrative fields.
 *
 * Converts Writing Agent Markdown output into DOCX XML paragraphs
 * that inherit the template's run properties (font, size, color, etc.).
 *
 * Supported Markdown:
 *   - Paragraphs (blank line separation)
 *   - **bold** and *italic*
 *   - Unordered lists (- item)
 *   - Ordered lists (1. item)
 *   - Line breaks within paragraphs
 */

/**
 * Style context extracted from the template location where the narrative will be inserted.
 * If not provided, no run properties are applied (inherits document defaults).
 */
export interface NarrativeStyleContext {
  /** Raw <w:rPr>...</w:rPr> XML from the template run surrounding the placeholder */
  runProperties?: string;
  /** Raw <w:pPr>...</w:pPr> XML from the template paragraph containing the placeholder */
  paragraphProperties?: string;
}

interface TextSegment {
  text: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Convert a Markdown string into DOCX XML paragraphs.
 * Inherits style from the template context so the generated content
 * matches the surrounding document formatting.
 */
export function markdownToOoxml(
  markdown: string,
  style: NarrativeStyleContext = {}
): string {
  const lines = markdown.split('\n');
  const blocks = parseBlocks(lines);
  return blocks.map((block) => renderBlock(block, style)).join('');
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

type Block =
  | { type: 'paragraph'; segments: TextSegment[] }
  | { type: 'unordered_list'; items: TextSegment[][] }
  | { type: 'ordered_list'; items: { index: number; segments: TextSegment[] }[] };

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip empty lines (they separate blocks)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items: TextSegment[][] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i]?.trim() ?? '')) {
        const itemText = (lines[i] ?? '').replace(/^[-*+]\s+/, '');
        items.push(parseInline(itemText));
        i++;
      }
      blocks.push({ type: 'unordered_list', items });
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s+/.test(line)) {
      const items: { index: number; segments: TextSegment[] }[] = [];
      let idx = 1;
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i]?.trim() ?? '')) {
        const itemText = (lines[i] ?? '').replace(/^\d+[.)]\s+/, '');
        items.push({ index: idx++, segments: parseInline(itemText) });
        i++;
      }
      blocks.push({ type: 'ordered_list', items });
      continue;
    }

    // Regular paragraph — collect lines until blank line or list start
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? '';
      if (cur.trim() === '' || /^[-*+]\s+/.test(cur) || /^\d+[.)]\s+/.test(cur)) break;
      paraLines.push(cur.trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', segments: parseInline(paraLines.join(' ')) });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Inline parsing — **bold**, *italic*, ***bold+italic***
// ---------------------------------------------------------------------------

function parseInline(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Regex matches ***bold+italic***, **bold**, *italic*, or plain text
  const re = /(\*{3})(.*?)\1|(\*{2})(.*?)\3|(\*)(.*?)\5|([^*]+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m[1] === '***' && m[2] !== undefined) {
      segments.push({ text: m[2], bold: true, italic: true });
    } else if (m[3] === '**' && m[4] !== undefined) {
      segments.push({ text: m[4], bold: true, italic: false });
    } else if (m[5] === '*' && m[6] !== undefined) {
      segments.push({ text: m[6], bold: false, italic: true });
    } else if (m[7] !== undefined) {
      segments.push({ text: m[7], bold: false, italic: false });
    }
  }

  return segments.length > 0 ? segments : [{ text, bold: false, italic: false }];
}

// ---------------------------------------------------------------------------
// OOXML rendering
// ---------------------------------------------------------------------------

function renderBlock(block: Block, style: NarrativeStyleContext): string {
  switch (block.type) {
    case 'paragraph':
      return renderParagraph(block.segments, style);
    case 'unordered_list':
      return block.items.map((segs) => renderListItem(segs, style, 'bullet')).join('');
    case 'ordered_list':
      return block.items.map((item) => renderListItem(item.segments, style, 'decimal', item.index)).join('');
  }
}

function renderParagraph(segments: TextSegment[], style: NarrativeStyleContext): string {
  const pPr = style.paragraphProperties ?? '';
  const runs = segments.map((seg) => renderRun(seg, style)).join('');
  return `<w:p>${pPr}${runs}</w:p>`;
}

function renderListItem(
  segments: TextSegment[],
  style: NarrativeStyleContext,
  listType: 'bullet' | 'decimal',
  _index?: number
): string {
  // Build paragraph properties with list numbering
  const basePPr = style.paragraphProperties ?? '';

  // Insert list indicator into pPr or create new pPr
  const indent = '<w:ind w:left="720" w:hanging="360"/>';
  const listPPr = basePPr
    ? basePPr.replace('</w:pPr>', `${indent}</w:pPr>`)
    : `<w:pPr>${indent}</w:pPr>`;

  // Prefix with bullet/number character in a separate run
  const prefix = listType === 'bullet' ? '\u2022 ' : `${_index ?? 1}. `;
  const prefixRun = renderRun({ text: prefix, bold: false, italic: false }, style);

  const contentRuns = segments.map((seg) => renderRun(seg, style)).join('');
  return `<w:p>${listPPr}${prefixRun}${contentRuns}</w:p>`;
}

function renderRun(segment: TextSegment, style: NarrativeStyleContext): string {
  const escapedText = escapeXml(segment.text);

  // Build run properties: start from template's rPr, add bold/italic if needed
  let rPr = style.runProperties ?? '';

  if (segment.bold || segment.italic) {
    if (rPr) {
      // Insert bold/italic into existing rPr
      let insertions = '';
      if (segment.bold && !rPr.includes('<w:b/>') && !rPr.includes('<w:b ')) {
        insertions += '<w:b/>';
      }
      if (segment.italic && !rPr.includes('<w:i/>') && !rPr.includes('<w:i ')) {
        insertions += '<w:i/>';
      }
      if (insertions) {
        rPr = rPr.replace('<w:rPr>', `<w:rPr>${insertions}`);
      }
    } else {
      // Create new rPr with bold/italic
      let props = '';
      if (segment.bold) props += '<w:b/>';
      if (segment.italic) props += '<w:i/>';
      rPr = `<w:rPr>${props}</w:rPr>`;
    }
  }

  return `<w:r>${rPr}<w:t xml:space="preserve">${escapedText}</w:t></w:r>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
