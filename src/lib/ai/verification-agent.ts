import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODELS } from '@/types/pipeline';
import { VERIFICATION_SYSTEM_PROMPT } from './prompts/verification';

const client = new Anthropic();

export interface VerificationInput {
  projectData: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  fieldCompletions: Record<string, unknown>;
}

export async function runVerificationAgent(input: VerificationInput) {
  const response = await client.messages.create({
    model: AGENT_MODELS.verification,
    max_tokens: 8192,
    system: VERIFICATION_SYSTEM_PROMPT,
    tools: [
      {
        name: 'save_quality_report',
        description: 'Save the quality verification report with scores and issues',
        input_schema: {
          type: 'object' as const,
          properties: {
            global_score: { type: 'number' as const },
            errors: { type: 'array' as const },
            warnings: { type: 'array' as const },
            suggestions: { type: 'array' as const },
            field_scores: { type: 'object' as const },
          },
          required: ['global_score', 'errors', 'warnings', 'field_scores'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Verify the generated document for data integrity, text quality, and model data leakage.\n\nProject Data (source of truth):\n${JSON.stringify(input.projectData, null, 2)}\n\nGenerated Fields:\n${JSON.stringify(input.fieldCompletions, null, 2)}${input.modelMap ? `\n\nModel Map (check for data leakage from this):\n${JSON.stringify(input.modelMap, null, 2)}` : ''}`,
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
