import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODELS } from '@/types/pipeline';
import { MODEL_SYSTEM_PROMPT } from './prompts/model';

const client = new Anthropic();

export interface ModelAgentInput {
  documents: {
    filename: string;
    content: string;
  }[];
}

export async function runModelAgent(input: ModelAgentInput) {
  const documentsText = input.documents
    .map((d) => `--- Model Document: ${d.filename} ---\n${d.content}`)
    .join('\n\n');

  const response = await client.messages.create({
    model: AGENT_MODELS.model,
    max_tokens: 8192,
    system: MODEL_SYSTEM_PROMPT,
    tools: [
      {
        name: 'save_model_map',
        description: 'Save style and rhetorical analysis of model documents. MUST NOT contain any factual data.',
        input_schema: {
          type: 'object' as const,
          properties: {
            sections: { type: 'array' as const },
            globalStyle: { type: 'object' as const },
            rhetoricalPatterns: { type: 'object' as const },
            domainVocabulary: { type: 'object' as const },
          },
          required: ['sections', 'globalStyle', 'rhetoricalPatterns', 'domainVocabulary'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Analyze the following model documents for STYLE, TONE, and STRUCTURE ONLY. Extract rhetorical patterns and domain vocabulary. Do NOT extract any factual data (names, dates, amounts, CUI, etc.).\n\n${documentsText}`,
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
