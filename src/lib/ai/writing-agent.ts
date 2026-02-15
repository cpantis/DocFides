import Anthropic from '@anthropic-ai/sdk';
import { AGENT_MODELS } from '@/types/pipeline';
import { WRITING_SYSTEM_PROMPT } from './prompts/writing';

const client = new Anthropic();

export interface WritingInput {
  projectData: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  draftPlan: Record<string, unknown>;
}

export async function runWritingAgent(input: WritingInput) {
  // Pass 1: Generate
  const pass1 = await generatePass(input, 'generate');

  // Pass 2: Coherence check
  const pass2 = await generatePass(
    { ...input, previousPass: pass1.output },
    'coherence'
  );

  // Pass 3: Polish
  const pass3 = await generatePass(
    { ...input, previousPass: pass2.output },
    'polish'
  );

  return {
    output: pass3.output,
    tokenUsage: {
      inputTokens: pass1.tokenUsage.inputTokens + pass2.tokenUsage.inputTokens + pass3.tokenUsage.inputTokens,
      outputTokens: pass1.tokenUsage.outputTokens + pass2.tokenUsage.outputTokens + pass3.tokenUsage.outputTokens,
    },
  };
}

async function generatePass(
  input: WritingInput & { previousPass?: Record<string, unknown> },
  pass: 'generate' | 'coherence' | 'polish'
) {
  const passInstructions = {
    generate: 'Generate text for each narrative field. Copy/computed fields should be pre-filled directly. For ambiguous entity fields, provide one suggestion per possible entity.',
    coherence: 'Re-read the ENTIRE draft. Check data consistency, cross-references, narrative flow, and repetitions. Fix any issues found.',
    polish: 'Final polish: grammar, terminology uniformity, length adjustment, tone consistency. Ensure all Romanian diacritics are correct (ș not ş, ț not ţ).',
  };

  const response = await client.messages.create({
    model: AGENT_MODELS.writing,
    max_tokens: 16384,
    system: WRITING_SYSTEM_PROMPT,
    tools: [
      {
        name: 'save_field_completions',
        description: 'Save generated text for each template field',
        input_schema: {
          type: 'object' as const,
          properties: {
            fields: { type: 'object' as const },
            qualityScores: { type: 'object' as const },
          },
          required: ['fields'],
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `${passInstructions[pass]}\n\nProject Data:\n${JSON.stringify(input.projectData, null, 2)}\n\nDraft Plan:\n${JSON.stringify(input.draftPlan, null, 2)}${input.modelMap ? `\n\nModel Map (STYLE ONLY):\n${JSON.stringify(input.modelMap, null, 2)}` : ''}${input.previousPass ? `\n\nPrevious Pass Output:\n${JSON.stringify(input.previousPass, null, 2)}` : ''}`,
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
