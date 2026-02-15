import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODELS } from '@/types/pipeline';
import { TEMPLATE_SYSTEM_PROMPT } from './prompts/template';

const client = new Anthropic();

export async function runTemplateAgent(templateContent: string) {
  const response = await client.messages.create({
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
            fields: { type: 'array' as const },
            conditionalSections: { type: 'array' as const },
            dynamicTables: { type: 'array' as const },
            headerFooterPlaceholders: { type: 'array' as const },
          },
          required: ['fields'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Analyze the following template document. Identify all fillable fields, classify each (copy/narrative/table_fill/computed/conditional), and generate hints.\n\n${templateContent}`,
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
