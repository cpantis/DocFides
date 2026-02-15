/**
 * Dynamic table row generation for DOCX export.
 * Clones the model row's style for each data element.
 */

export interface DynamicTableConfig {
  templateTableIndex: number;
  modelRowIndex: number;
  data: string[][];
  autoTotals: boolean;
}

export function generateDynamicRows(config: DynamicTableConfig): string[][] {
  // TODO: Implement with docx-js
  // 1. Read model row style (borders, font, alignment, colors)
  // 2. Clone style for each data row
  // 3. If autoTotals, calculate and append totals row
  // 4. If data is empty, return single "No data available" row
  if (config.data.length === 0) {
    return [['No data available']];
  }
  return config.data;
}
