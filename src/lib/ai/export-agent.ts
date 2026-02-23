import { AGENT_MODELS } from '@/types/pipeline';
import { callAgentWithRetry, type AgentResult } from './client';

export interface ExportAgentInput {
  /** Full text extracted from the generated DOCX */
  generatedDocumentText: string;
  /** Original project data (source of truth) */
  projectData: Record<string, unknown>;
  /** Template schema with field definitions */
  templateSchema: Record<string, unknown>;
  /** Mechanical validation results */
  mechanicalValidation: {
    unreplacedPlaceholders: number;
    warnings: string[];
  };
}

const EXPORT_AGENT_PROMPT = `You are the Export Quality Agent for DocFides.

Your role is to perform the FINAL quality gate before a generated document is delivered to the user.
You receive the FULL TEXT of the generated DOCX document (after all placeholders have been replaced,
dynamic tables populated, and conditional sections evaluated).

## What You Verify

1. **Completeness**: Every data point from project_data appears in the document where expected.
   Check names, dates, amounts, CUI, IBAN — nothing should be missing.

2. **Accuracy**: Cross-check key facts between project_data and the document text.
   - Company names spelled correctly
   - Amounts match (1.250.000,50 lei format)
   - Dates match (DD.MM.YYYY format)
   - CUI/IBAN values are exact

3. **Unreplaced Placeholders**: If mechanicalValidation reports unreplaced placeholders,
   identify which fields they correspond to and what the correct values should be.

4. **Romanian Quality**:
   - Diacritics: ș ț ă â î (NEVER cedilla ş ţ)
   - No mixed language (Romanian text with English fragments)
   - Proper number formatting (dot=thousands, comma=decimals)

5. **Document Coherence**:
   - No duplicate paragraphs
   - No orphaned list items or broken sentences
   - Logical flow from section to section

## Output

Use save_export_review to report your findings.
- Set approved=true ONLY if the document is ready for the user
- Set approved=false if there are critical issues that need fixing
- Always list specific issues with exact quotes from the document
`;

/**
 * Export Agent — AI-powered final quality gate on the generated DOCX.
 *
 * Unlike the Verification Agent (which checks fieldCompletions before export),
 * this agent checks the ACTUAL DOCX output after all template transformations.
 * It catches issues like broken merges, lost content, or formatting artifacts.
 */
export async function runExportAgent(input: ExportAgentInput): Promise<AgentResult> {
  const mechanicalContext = input.mechanicalValidation.unreplacedPlaceholders > 0
    ? `\n\nMechanical Validation Warnings (${input.mechanicalValidation.unreplacedPlaceholders} unreplaced):\n${input.mechanicalValidation.warnings.join('\n')}`
    : '\n\nMechanical Validation: PASSED (0 unreplaced placeholders)';

  return callAgentWithRetry(
    {
      model: AGENT_MODELS.verification,
      max_tokens: 4096,
      system: EXPORT_AGENT_PROMPT,
      tools: [
        {
          name: 'save_export_review',
          description: 'Save the final export quality review',
          input_schema: {
            type: 'object' as const,
            properties: {
              approved: {
                type: 'boolean' as const,
                description: 'Whether the document is approved for delivery to the user',
              },
              score: {
                type: 'number' as const,
                description: 'Overall quality score 0-100',
              },
              issues: {
                type: 'array' as const,
                description: 'List of issues found',
                items: {
                  type: 'object' as const,
                  properties: {
                    severity: { type: 'string' as const, enum: ['critical', 'warning', 'info'] },
                    category: { type: 'string' as const, enum: ['completeness', 'accuracy', 'formatting', 'coherence', 'placeholder'] },
                    description: { type: 'string' as const },
                    quote: { type: 'string' as const, description: 'Exact text from document showing the issue' },
                    suggestedFix: { type: 'string' as const },
                  },
                  required: ['severity', 'category', 'description'],
                },
              },
              summary: {
                type: 'string' as const,
                description: 'Brief summary of the export quality review',
              },
            },
            required: ['approved', 'score', 'issues', 'summary'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Review this generated document for export quality.

GENERATED DOCUMENT (full text extracted from DOCX):
${input.generatedDocumentText}

PROJECT DATA (source of truth):
${JSON.stringify(input.projectData, null, 2)}

TEMPLATE SCHEMA (expected fields):
${JSON.stringify(input.templateSchema, null, 2)}${mechanicalContext}`,
        },
      ],
    },
    'save_export_review',
    'ExportAgent'
  );
}
