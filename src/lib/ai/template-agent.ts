import { AGENT_MODELS } from '@/types/pipeline';
import { TEMPLATE_SYSTEM_PROMPT } from './prompts/template';
import { callAgentWithRetry, type AgentResult } from './client';

export async function runTemplateAgent(templateContent: string): Promise<AgentResult> {
  return callAgentWithRetry(
    {
      model: AGENT_MODELS.template,
      max_tokens: 8192,
      system: TEMPLATE_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_template_schema',
          description: 'Save identified template fields with classification and hints',
          input_schema: {
            type: 'object' as const,
            properties: {
              fields: {
                type: 'array' as const,
                description: 'All fillable fields with id, location, type, hint',
                items: {
                  type: 'object' as const,
                  properties: {
                    id: { type: 'string' as const },
                    location: { type: 'object' as const },
                    expectedType: {
                      type: 'string' as const,
                      enum: ['copy', 'narrative', 'table_fill', 'computed', 'conditional'],
                    },
                    hint: { type: 'string' as const },
                    userHint: { type: 'string' as const },
                    estimatedLength: { type: 'string' as const },
                  },
                  required: ['id', 'expectedType', 'hint'],
                },
              },
              conditionalSections: {
                type: 'array' as const,
                description: 'Sections that only appear if a condition is met',
              },
              dynamicTables: {
                type: 'array' as const,
                description: 'Tables with variable row counts',
              },
              headerFooterPlaceholders: {
                type: 'array' as const,
                description: 'Placeholders in headers/footers',
              },
            },
            required: ['fields'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Analyze the following template document. Identify all fillable fields, classify each (copy/narrative/table_fill/computed/conditional), detect dynamic tables and conditional sections, and generate descriptive hints.\n\n${templateContent}`,
        },
      ],
    },
    'save_template_schema'
  );
}
