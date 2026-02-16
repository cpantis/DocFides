import { AGENT_MODELS } from '@/types/pipeline';
import { EXTRACTOR_SYSTEM_PROMPT } from './prompts/extractor';
import { callAgentWithRetry, type AgentResult } from './client';

export interface ExtractorInput {
  documents: {
    filename: string;
    content: string;
    role: 'source';
  }[];
}

export async function runExtractorAgent(input: ExtractorInput): Promise<AgentResult> {
  const documentsText = input.documents
    .map((d) => `--- Document: ${d.filename} ---\n${d.content}`)
    .join('\n\n');

  return callAgentWithRetry(
    {
      model: AGENT_MODELS.extractor,
      max_tokens: 8192,
      system: EXTRACTOR_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_extracted_data',
          description: 'Save validated extracted data organized by entities',
          input_schema: {
            type: 'object' as const,
            properties: {
              entities: {
                type: 'object' as const,
                description: 'Data organized by entity role',
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
                description: 'All dates, keyed by purpose',
              },
              tables: {
                type: 'array' as const,
                description: 'Structured tables with name, headers, rows',
              },
              validation_issues: {
                type: 'array' as const,
                description: 'Validation issues found',
              },
            },
            required: ['entities', 'project'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Extract all factual data from the following source documents. Organize by entity (beneficiary, contractor, subcontractors). Use filename hints to assign entity roles. Validate CUI checksums, IBAN format, dates, and financial totals.\n\n${documentsText}`,
        },
      ],
    },
    'save_extracted_data'
  );
}
