import { AGENT_MODELS } from '@/types/pipeline';
import { MAPPING_SYSTEM_PROMPT } from './prompts/mapping';
import { callAgentWithRetry, type AgentResult } from './client';

export interface MappingInput {
  projectData: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  templateSchema: Record<string, unknown>;
}

export async function runMappingAgent(input: MappingInput): Promise<AgentResult> {
  const modelMapSection = input.modelMap
    ? `\n\nModel Map (STYLE ONLY — no factual data):\n${JSON.stringify(input.modelMap, null, 2)}`
    : '';

  return callAgentWithRetry(
    {
      model: AGENT_MODELS.mapping,
      max_tokens: 8192,
      system: MAPPING_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_draft_plan',
          description: 'Save the mapping of data to template fields with strategy per field type',
          input_schema: {
            type: 'object' as const,
            properties: {
              fieldMappings: {
                type: 'array' as const,
                description: 'Mapping strategy for each template field',
                items: {
                  type: 'object' as const,
                  properties: {
                    fieldId: { type: 'string' as const },
                    templateField: { type: 'string' as const },
                    type: {
                      type: 'string' as const,
                      enum: ['copy', 'narrative', 'table_fill', 'computed', 'conditional'],
                    },
                    dataSource: { type: 'string' as const, description: 'Dot-notation path in project data' },
                    formula: { type: 'string' as const },
                    condition: { type: 'string' as const },
                    needsMultipleSuggestions: { type: 'boolean' as const },
                    possibleSources: { type: 'array' as const, items: { type: 'string' as const } },
                    styleGuidance: { type: 'string' as const },
                  },
                  required: ['fieldId', 'type', 'dataSource'],
                },
              },
              unmappedFields: {
                type: 'array' as const,
                description: 'Fields that could not be mapped',
                items: {
                  type: 'object' as const,
                  properties: {
                    fieldId: { type: 'string' as const },
                    reason: { type: 'string' as const },
                  },
                },
              },
              ambiguousFields: {
                type: 'array' as const,
                description: 'Fields with multiple possible entity sources',
                items: {
                  type: 'object' as const,
                  properties: {
                    fieldId: { type: 'string' as const },
                    possibleEntities: { type: 'array' as const, items: { type: 'string' as const } },
                  },
                },
              },
            },
            required: ['fieldMappings'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Map the extracted project data to the template fields. For each field, specify the data source (dot-notation path), mapping type, and strategy. Flag ambiguous entity fields.\n\nProject Data:\n${JSON.stringify(input.projectData, null, 2)}\n\nTemplate Schema:\n${JSON.stringify(input.templateSchema, null, 2)}${modelMapSection}`,
        },
      ],
    },
    'save_draft_plan'
  );
}
