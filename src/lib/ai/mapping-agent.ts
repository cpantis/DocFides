import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODELS } from '@/types/pipeline';
import { MAPPING_SYSTEM_PROMPT } from './prompts/mapping';

const client = new Anthropic();

export interface MappingInput {
  projectData: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  templateSchema: Record<string, unknown>;
}

export async function runMappingAgent(input: MappingInput) {
  const response = await client.messages.create({
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
            fieldMappings: { type: 'array' as const },
            unmappedFields: { type: 'array' as const },
            ambiguousFields: { type: 'array' as const },
          },
          required: ['fieldMappings'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Map the extracted project data to the template fields. Use the model map for style guidance only.\n\nProject Data:\n${JSON.stringify(input.projectData, null, 2)}\n\nTemplate Schema:\n${JSON.stringify(input.templateSchema, null, 2)}${input.modelMap ? `\n\nModel Map (STYLE ONLY — no factual data):\n${JSON.stringify(input.modelMap, null, 2)}` : ''}`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  return {
    output: toolUse?.type === 'tool_use' ? (toolUse.input as Record<string, unknown>) : {},
    tokenUsage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
