/**
 * Dynamic table row generation for DOCX export.
 * Works at the DOCX XML level to clone model row styles and populate data.
 */

export interface DynamicTableConfig {
  tableIndex: number;
  modelRowIndex: number;
  data: string[][];
  headers?: string[];
  autoTotals: boolean;
  totalsColumns?: number[];
}

/**
 * Process dynamic tables in DOCX XML content.
 * For each config, finds the target table, clones the model row style,
 * and generates data rows + optional totals row.
 */
export function processDynamicTables(
  xml: string,
  tables: DynamicTableConfig[]
): string {
  if (tables.length === 0) return xml;

  let result = xml;

  // Sort by table index descending so modifications don't shift indices
  const sorted = [...tables].sort((a, b) => b.tableIndex - a.tableIndex);

  for (const config of sorted) {
    result = processTable(result, config);
  }

  return result;
}

function processTable(xml: string, config: DynamicTableConfig): string {
  // Find all <w:tbl> elements
  const tableRegex = /<w:tbl[ >][\s\S]*?<\/w:tbl>/g;
  const tableMatches: { match: string; index: number }[] = [];

  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(xml)) !== null) {
    tableMatches.push({ match: m[0], index: m.index });
  }

  if (config.tableIndex >= tableMatches.length) {
    console.warn(`[DocGen] Table index ${config.tableIndex} not found (${tableMatches.length} tables)`);
    return xml;
  }

  const table = tableMatches[config.tableIndex]!;
  const updatedTable = replaceTableRows(table.match, config);

  return (
    xml.substring(0, table.index) +
    updatedTable +
    xml.substring(table.index + table.match.length)
  );
}

function replaceTableRows(tableXml: string, config: DynamicTableConfig): string {
  // Extract all <w:tr> rows
  const rowRegex = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
  const rows: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(tableXml)) !== null) {
    rows.push(m[0]);
  }

  if (config.modelRowIndex >= rows.length) {
    console.warn(`[DocGen] Model row index ${config.modelRowIndex} not found (${rows.length} rows)`);
    return tableXml;
  }

  const modelRow = rows[config.modelRowIndex]!;

  // Generate new rows from data
  let newRows: string[];

  if (config.data.length === 0) {
    // Empty data → single "No data available" row
    newRows = [createEmptyDataRow(modelRow)];
  } else {
    newRows = config.data.map((rowData) =>
      createDataRow(modelRow, rowData)
    );

    // Add totals row if requested
    if (config.autoTotals && config.totalsColumns && config.totalsColumns.length > 0) {
      const totalsRow = createTotalsRow(modelRow, config.data, config.totalsColumns);
      newRows.push(totalsRow);
    }
  }

  // Replace the model row with generated rows
  // Keep all rows before model row, replace model row, keep rows after
  const beforeRows = rows.slice(0, config.modelRowIndex);
  const afterRows = rows.slice(config.modelRowIndex + 1);

  // Rebuild table: everything before first row + all rows + everything after last row
  const firstRowStart = tableXml.indexOf(rows[0]!);
  const lastRow = rows[rows.length - 1]!;
  const lastRowEnd = tableXml.lastIndexOf(lastRow) + lastRow.length;

  const tablePrefix = tableXml.substring(0, firstRowStart);
  const tableSuffix = tableXml.substring(lastRowEnd);

  const allRows = [...beforeRows, ...newRows, ...afterRows];

  return tablePrefix + allRows.join('') + tableSuffix;
}

/**
 * Create a data row by cloning the model row's XML structure
 * and replacing cell text content with provided data.
 */
function createDataRow(modelRow: string, data: string[]): string {
  // Extract all cells from model row
  const cellRegex = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(modelRow)) !== null) {
    cells.push(m[0]);
  }

  // Replace cell content with data, preserving formatting
  const newCells = cells.map((cell, idx) => {
    const value = data[idx] ?? '';
    return replaceCellText(cell, value);
  });

  // Rebuild the row with new cells
  let result = modelRow;
  for (let i = cells.length - 1; i >= 0; i--) {
    result = result.replace(cells[i]!, newCells[i]!);
  }

  return result;
}

/**
 * Replace all text content in a table cell while preserving formatting.
 */
function replaceCellText(cellXml: string, newText: string): string {
  const escapedText = escapeXml(newText);

  // Find all <w:t> elements and replace the first one's text,
  // remove text from the rest
  let firstTextFound = false;
  return cellXml.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, (_match) => {
    if (!firstTextFound) {
      firstTextFound = true;
      return `<w:t xml:space="preserve">${escapedText}</w:t>`;
    }
    return '<w:t></w:t>';
  });
}

/**
 * Create a row showing "No data available" spanning all columns.
 */
function createEmptyDataRow(modelRow: string): string {
  const cellRegex = /<w:tc[ >][\s\S]*?<\/w:tc>/g;
  const cells: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(modelRow)) !== null) {
    cells.push(m[0]);
  }

  if (cells.length === 0) return modelRow;

  // First cell gets the "No data available" text with italic formatting
  const firstCell = replaceCellText(cells[0]!, 'No data available');
  // Add italic to the first cell's run properties
  const italicFirstCell = addItalicToCell(firstCell);

  // Other cells get empty text
  const emptyCells = cells.slice(1).map((cell) => replaceCellText(cell, ''));

  let result = modelRow;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (i === 0) {
      result = result.replace(cells[i]!, italicFirstCell);
    } else {
      result = result.replace(cells[i]!, emptyCells[i - 1]!);
    }
  }

  return result;
}

/**
 * Add italic formatting to a cell's first text run.
 */
function addItalicToCell(cellXml: string): string {
  // If <w:rPr> exists in the first run, add <w:i/> to it
  // If not, create a <w:rPr><w:i/></w:rPr> before <w:t>
  if (cellXml.includes('<w:rPr>')) {
    return cellXml.replace(/<w:rPr>/, '<w:rPr><w:i/>');
  }
  return cellXml.replace(/<w:t/, '<w:rPr><w:i/></w:rPr><w:t');
}

/**
 * Create a totals row summing specified columns.
 */
function createTotalsRow(
  modelRow: string,
  data: string[][],
  totalsColumns: number[]
): string {
  const totals: string[] = [];
  const colCount = data[0]?.length ?? 0;

  for (let col = 0; col < colCount; col++) {
    if (totalsColumns.includes(col)) {
      const sum = data.reduce((acc, row) => {
        const val = parseFloat((row[col] ?? '0').replace(/[,.]/g, (m) => m === ',' ? '.' : ''));
        return acc + (isNaN(val) ? 0 : val);
      }, 0);
      totals.push(formatNumber(sum));
    } else if (col === 0) {
      totals.push('TOTAL');
    } else {
      totals.push('');
    }
  }

  // Clone model row with bold formatting for totals
  const row = createDataRow(modelRow, totals);
  return addBoldToRow(row);
}

function addBoldToRow(rowXml: string): string {
  // Add <w:b/> to all <w:rPr> in the row
  let result = rowXml;
  if (result.includes('<w:rPr>')) {
    result = result.replace(/<w:rPr>/g, '<w:rPr><w:b/>');
  }
  return result;
}

function formatNumber(num: number): string {
  return num.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
