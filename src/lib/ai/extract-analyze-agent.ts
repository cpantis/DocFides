/**
 * Agent 1 — Extract & Analyze (Sonnet 4.5)
 *
 * Combines 4 old agents into a single API call:
 *   - Extractor (factual data from source docs)
 *   - Model (style from model docs)
 *   - Template (field identification)
 *   - Mapping (data-to-field mapping)
 *
 * Input: parsed text from all documents (source + model + template)
 * Output: single JSON with project_data + style_guide + field_map
 */

import { AGENT_MODELS } from '@/types/pipeline';
import { EXTRACT_ANALYZE_SYSTEM_PROMPT } from './prompts/extract-analyze';
import { callAgentWithRetry, type AgentResult } from './client';

export interface ExtractAnalyzeInput {
  sourceDocs: {
    filename: string;
    content: string;
    tag?: string;
  }[];
  modelDocs?: {
    filename: string;
    content: string;
  }[];
  templateDoc: {
    filename: string;
    content: string;
  };
  projectId?: string;
}

export async function runExtractAnalyzeAgent(input: ExtractAnalyzeInput): Promise<AgentResult> {
  // Build source documents section
  const sourceSection = input.sourceDocs
    .map((d) => {
      const tagLine = d.tag ? ` [Tag: ${d.tag}]` : '';
      return `--- Source Document: ${d.filename}${tagLine} ---\n${d.content}`;
    })
    .join('\n\n');

  // Build model documents section (optional)
  const modelSection = input.modelDocs && input.modelDocs.length > 0
    ? '\n\n=== MODEL DOCUMENTS (STYLE ONLY — NEVER extract factual data) ===\n\n' +
      input.modelDocs
        .map((d) => `--- Model Document: ${d.filename} ---\n${d.content}`)
        .join('\n\n')
    : '';

  // Build template section
  const templateSection = `\n\n=== TEMPLATE DOCUMENT ===\n\n--- Template: ${input.templateDoc.filename} ---\n${input.templateDoc.content}`;

  const userMessage =
    `Analyze ALL documents below in a single pass:\n` +
    `1. Extract factual data from source documents (organized by entity)\n` +
    `2. ${input.modelDocs?.length ? 'Analyze style from model documents (STYLE ONLY, no facts)' : 'No model documents provided — skip style analysis, use empty object for style_guide'}\n` +
    `3. Identify and classify all template fields\n` +
    `4. Map extracted data to template fields\n\n` +
    `Use save_extract_analyze to return the combined result.\n\n` +
    `=== SOURCE DOCUMENTS ===\n\n${sourceSection}${modelSection}${templateSection}`;

  const result = await callAgentWithRetry(
    {
      model: AGENT_MODELS.extract_analyze,
      max_tokens: 16384,
      system: EXTRACT_ANALYZE_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_extract_analyze',
          description: 'Save extracted data, style analysis, and field mapping in a single structured result',
          input_schema: {
            type: 'object' as const,
            properties: {
              project_data: {
                type: 'object' as const,
                description: 'All extracted factual data from source documents',
                properties: {
                  entities: {
                    type: 'object' as const,
                    description: 'Data organized by entity role (beneficiary, contractor, subcontractors)',
                  },
                  project: {
                    type: 'object' as const,
                    description: 'Project-level data: title, description, location',
                  },
                  financial: {
                    type: 'object' as const,
                    description: 'Financial data: budget, amounts, line items',
                  },
                  dates: {
                    type: 'object' as const,
                    description: 'All dates keyed by purpose',
                  },
                  tables: {
                    type: 'array' as const,
                    description: 'Structured tables with name, headers, rows',
                  },
                  validation_issues: {
                    type: 'array' as const,
                    description: 'Validation issues found during extraction',
                  },
                },
                required: ['entities', 'project'],
              },
              style_guide: {
                type: 'object' as const,
                description: 'Style and tone analysis from model documents (empty {} if no model docs)',
                properties: {
                  globalStyle: {
                    type: 'object' as const,
                    description: 'Formality, technicality, sentence length preferences',
                  },
                  rhetoricalPatterns: {
                    type: 'object' as const,
                    description: 'Opening, transition, conclusion patterns',
                  },
                  domainVocabulary: {
                    type: 'object' as const,
                    description: 'Preferred terms, standard phrases, excluded terms',
                  },
                  sections: {
                    type: 'array' as const,
                    description: 'Section-level style analysis',
                  },
                },
              },
              field_map: {
                type: 'object' as const,
                description: 'Template fields with classification and data mapping',
                properties: {
                  templateType: {
                    type: 'string' as const,
                    enum: ['docx', 'acroform', 'flat_pdf'],
                  },
                  fields: {
                    type: 'array' as const,
                    description: 'All template fields with id, contentType, hint, dataSource, and mapping strategy',
                    items: {
                      type: 'object' as const,
                      properties: {
                        id: { type: 'string' as const },
                        placeholder: { type: 'string' as const },
                        contentType: {
                          type: 'string' as const,
                          enum: ['copy', 'narrative', 'table_fill', 'computed', 'conditional'],
                        },
                        hint: { type: 'string' as const },
                        dataSource: { type: 'string' as const, description: 'Dot-notation path in project_data' },
                        formula: { type: 'string' as const },
                        condition: { type: 'string' as const },
                        needsMultipleSuggestions: { type: 'boolean' as const },
                        possibleSources: { type: 'array' as const, items: { type: 'string' as const } },
                        styleGuidance: { type: 'string' as const },
                        estimatedLength: { type: 'string' as const },
                      },
                      required: ['id', 'contentType', 'hint'],
                    },
                  },
                  conditionalSections: {
                    type: 'array' as const,
                    description: 'Sections that appear only if a condition is met',
                  },
                  dynamicTables: {
                    type: 'array' as const,
                    description: 'Tables with variable row counts',
                  },
                  unmappedFields: {
                    type: 'array' as const,
                    description: 'Fields that could not be mapped to data',
                  },
                },
                required: ['fields'],
              },
            },
            required: ['project_data', 'style_guide', 'field_map'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    },
    'save_extract_analyze',
    'ExtractAnalyze',
    input.projectId
  );

  // Post-validation: check for model data leakage in project_data
  if (input.modelDocs && input.modelDocs.length > 0) {
    const outputStr = JSON.stringify(result.output.style_guide ?? {});
    const leakagePatterns = [
      /\bRO\d{2,10}\b/,       // CUI pattern
      /\bRO\d{2}[A-Z]{4}\b/,  // IBAN start
      /\d{1,3}\.\d{3}\.\d{3}/,// Romanian number format (amounts)
      /\d{2}\.\d{2}\.\d{4}/,  // Date DD.MM.YYYY
    ];

    const warnings: string[] = [];
    for (const pattern of leakagePatterns) {
      if (pattern.test(outputStr)) {
        warnings.push(`Possible data leakage in style_guide: ${pattern.source}`);
      }
    }

    if (warnings.length > 0) {
      console.warn('[ExtractAnalyze] Data leakage warnings:', warnings);
      const styleGuide = result.output.style_guide as Record<string, unknown> ?? {};
      styleGuide['_dataLeakageWarnings'] = warnings;
      result.output.style_guide = styleGuide;
    }
  }

  return result;
}
