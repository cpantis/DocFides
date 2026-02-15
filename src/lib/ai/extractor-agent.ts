import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODELS } from '@/types/pipeline';
import { EXTRACTOR_SYSTEM_PROMPT } from './prompts/extractor';

const client = new Anthropic();

export interface ExtractorInput {
  documents: {
    filename: string;
    content: string;
    role: 'source';
  }[];
}

export async function runExtractorAgent(input: ExtractorInput) {
  const documentsText = input.documents
    .map((d) => `--- Document: ${d.filename} ---\n${d.content}`)
    .join('\n\n');

  const response = await client.messages.create({
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
            entities: { type: 'object' as const },
            project: { type: 'object' as const },
            financial: { type: 'object' as const },
            dates: { type: 'object' as const },
            tables: { type: 'array' as const },
            validation_issues: { type: 'array' as const },
          },
          required: ['entities', 'project'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Extract all factual data from the following source documents. Organize by entity (beneficiary, contractor, subcontractors). Validate all fields.\n\n${documentsText}`,
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
