/**
 * DOCX generation orchestrator.
 * Opens a DOCX template (ZIP), applies all transformations
 * (placeholder replacement, dynamic tables, conditional sections, headers/footers),
 * and outputs an export-ready DOCX buffer.
 */

import JSZip from 'jszip';
import { replaceTextPlaceholders, type PlaceholderReplacement } from './template-filler';
import { processDynamicTables, type DynamicTableConfig } from './dynamic-tables';
import { processConditionalSections, type ConditionalSection } from './conditional-sections';
import { processHeadersFooters, type HeaderFooterReplacement } from './header-footer';

export interface DocxGenerationInput {
  templateBuffer: Buffer;
  fieldValues: Record<string, string>;
  /** Field IDs whose values are Markdown narratives (multi-paragraph, with formatting) */
  narrativeFields?: Set<string>;
  dynamicTables?: DynamicTableInput[];
  conditionalSections?: ConditionalSectionInput[];
  headerFooterValues?: Record<string, string>;
  projectData?: Record<string, unknown>;
}

export interface DynamicTableInput {
  templateTableIndex: number;
  modelRowIndex: number;
  dataSource: string;
  rows: string[][];
  autoTotals: boolean;
  totalsColumns?: number[];
}

export interface ConditionalSectionInput {
  sectionId: string;
  condition: string;
  includeHeading: boolean;
  headingText?: string;
}

/**
 * Generate a DOCX document from a template buffer and field data.
 */
export async function generateDocx(input: DocxGenerationInput): Promise<Buffer> {
  const startTime = Date.now();
  console.log('[DocGen] Starting DOCX generation...');

  // 1. Open template DOCX as ZIP
  const zip = await JSZip.loadAsync(input.templateBuffer);

  // 2. Get the main document XML
  const documentFile = zip.file('word/document.xml');
  if (!documentFile) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }
  let documentXml = await documentFile.async('string');

  // 3. Replace field placeholders (simple + narrative)
  if (Object.keys(input.fieldValues).length > 0) {
    const narrativeIds = input.narrativeFields ?? new Set<string>();
    const replacements: PlaceholderReplacement[] = Object.entries(input.fieldValues).map(
      ([placeholder, value]) => ({
        placeholder,
        value,
        isNarrative: narrativeIds.has(placeholder),
      })
    );
    const narrativeCount = replacements.filter((r) => r.isNarrative).length;
    documentXml = replaceTextPlaceholders(documentXml, replacements);
    console.log(
      `[DocGen] Replaced ${replacements.length} field placeholders (${narrativeCount} narrative → Markdown→OOXML)`
    );
  }

  // 4. Process dynamic tables
  if (input.dynamicTables && input.dynamicTables.length > 0) {
    const tableConfigs: DynamicTableConfig[] = input.dynamicTables.map((t) => ({
      tableIndex: t.templateTableIndex,
      modelRowIndex: t.modelRowIndex,
      data: t.rows,
      autoTotals: t.autoTotals,
      totalsColumns: t.totalsColumns,
    }));
    documentXml = processDynamicTables(documentXml, tableConfigs);
    console.log(`[DocGen] Processed ${tableConfigs.length} dynamic tables`);
  }

  // 5. Evaluate and remove conditional sections
  if (input.conditionalSections && input.conditionalSections.length > 0 && input.projectData) {
    const sections: ConditionalSection[] = input.conditionalSections.map((s) => ({
      sectionId: s.sectionId,
      condition: s.condition,
      includeHeading: s.includeHeading,
      headingText: s.headingText,
    }));
    documentXml = processConditionalSections(documentXml, sections, input.projectData);
    console.log(`[DocGen] Evaluated ${sections.length} conditional sections`);
  }

  // 6. Write updated document XML back
  zip.file('word/document.xml', documentXml);

  // 7. Process header/footer replacements
  if (input.headerFooterValues && Object.keys(input.headerFooterValues).length > 0) {
    const hfReplacements: HeaderFooterReplacement[] = Object.entries(
      input.headerFooterValues
    ).map(([placeholder, value]) => ({ placeholder, value }));
    await processHeadersFooters(zip, hfReplacements);
    console.log(`[DocGen] Replaced ${hfReplacements.length} header/footer placeholders`);
  }

  // 8. Serialize to buffer
  const outputBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const durationMs = Date.now() - startTime;
  console.log(`[DocGen] DOCX generation complete (${durationMs}ms, ${outputBuffer.length} bytes)`);

  return outputBuffer;
}

/**
 * Build DocxGenerationInput from pipeline outputs.
 * Maps fieldCompletions, draftPlan, and templateSchema to generator input format.
 */
export function buildGenerationInput(
  templateBuffer: Buffer,
  fieldCompletions: Record<string, unknown>,
  draftPlan: Record<string, unknown>,
  templateSchema: Record<string, unknown>,
  projectData: Record<string, unknown>
): DocxGenerationInput {
  // Build a set of narrative field IDs from templateSchema
  const narrativeFields = new Set<string>();
  const allSchemaFields = (templateSchema.fields ?? templateSchema) as Record<string, unknown>[] | undefined;
  if (Array.isArray(allSchemaFields)) {
    for (const field of allSchemaFields) {
      const f = field as Record<string, unknown>;
      if (f.contentType === 'narrative' || f.contentType === 'conditional') {
        const id = (f.placeholder ?? f.id ?? '') as string;
        if (id) narrativeFields.add(id);
      }
    }
  }

  // Extract field values (simple placeholder → value map)
  const fieldValues: Record<string, string> = {};
  const completions = (fieldCompletions.fields ?? fieldCompletions) as Record<string, unknown>;

  for (const [fieldId, completion] of Object.entries(completions)) {
    if (typeof completion === 'string') {
      fieldValues[fieldId] = completion;
    } else if (typeof completion === 'object' && completion !== null) {
      const c = completion as Record<string, unknown>;
      if (typeof c.value === 'string') {
        fieldValues[fieldId] = c.value;
      } else if (typeof c.text === 'string') {
        fieldValues[fieldId] = c.text;
      }
    }
  }

  // Extract dynamic table configs from draftPlan
  const dynamicTables: DynamicTableInput[] = [];
  const tableMappings = (draftPlan.tableMappings ?? draftPlan.fieldMappings) as Record<string, unknown>[] | undefined;

  if (Array.isArray(tableMappings)) {
    for (const mapping of tableMappings) {
      if ((mapping as Record<string, unknown>).type === 'table_fill') {
        const m = mapping as Record<string, unknown>;
        dynamicTables.push({
          templateTableIndex: (m.tableIndex as number) ?? 0,
          modelRowIndex: (m.modelRowIndex as number) ?? 1,
          dataSource: (m.dataSource as string) ?? '',
          rows: (m.rows as string[][]) ?? [],
          autoTotals: (m.autoTotals as boolean) ?? false,
          totalsColumns: m.totalsColumns as number[] | undefined,
        });
      }
    }
  }

  // Extract conditional sections from templateSchema
  const conditionalSections: ConditionalSectionInput[] = [];
  const schemaFields = (templateSchema.fields ?? templateSchema) as Record<string, unknown>[] | undefined;

  if (Array.isArray(schemaFields)) {
    for (const field of schemaFields) {
      const f = field as Record<string, unknown>;
      if (f.contentType === 'conditional' && typeof f.condition === 'string') {
        conditionalSections.push({
          sectionId: (f.id as string) ?? '',
          condition: f.condition,
          includeHeading: true,
          headingText: f.headingText as string | undefined,
        });
      }
    }
  }

  // Build header/footer values from field completions
  const headerFooterValues: Record<string, string> = {};
  const hfFields = (fieldCompletions.headerFooter ?? {}) as Record<string, unknown>;
  for (const [key, val] of Object.entries(hfFields)) {
    if (typeof val === 'string') {
      headerFooterValues[key] = val;
    }
  }

  return {
    templateBuffer,
    fieldValues,
    narrativeFields,
    dynamicTables,
    conditionalSections,
    headerFooterValues,
    projectData,
  };
}
