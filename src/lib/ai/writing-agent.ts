import { AGENT_MODELS } from '@/types/pipeline';
import { WRITING_SYSTEM_PROMPT } from './prompts/writing';
import { callAgentWithRetry, type AgentResult } from './client';

export interface WritingInput {
  projectData: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  draftPlan: Record<string, unknown>;
}

/**
 * Writing Agent — 3-pass text generation using Opus 4.6.
 *
 * Pass 1 (Generate): Write each narrative field, pre-fill copy/computed.
 * Pass 2 (Coherence): Re-read entire draft, fix consistency and flow.
 * Pass 3 (Polish): Grammar, terminology, diacritics, length, tone.
 */
export async function runWritingAgent(input: WritingInput): Promise<AgentResult> {
  // Pass 1: Generate
  const pass1 = await generatePass(input, 'generate');

  // Pass 2: Coherence check with Pass 1 output
  const pass2 = await generatePass(
    { ...input, previousPass: pass1.output },
    'coherence'
  );

  // Pass 3: Polish with Pass 2 output
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

const PASS_INSTRUCTIONS = {
  generate: `PASS 1 — GENERATE
Generate text for each template field according to the draft plan.
- For "copy" fields: extract the exact value from project data.
- For "narrative" fields: write professional text using project data and style guidance.
- For "computed" fields: calculate the value using the formula.
- For "conditional" fields: evaluate the condition and generate if true.
- For "table_fill" fields: populate from structured data.
- For ambiguous entity fields (needsMultipleSuggestions=true): provide one suggestion per entity.
Rate each field on factualAccuracy, styleTone, completeness, coherence (0-100).`,

  coherence: `PASS 2 — COHERENCE CHECK
Re-read the ENTIRE draft from Pass 1 (provided as previousPass).
Check and fix:
1. Data consistency: same values appear identically everywhere
2. Cross-references: section X mentions Y → Y exists and is correct
3. Narrative flow: no abrupt topic jumps, logical progression
4. Repetition: avoid identical phrases/constructions across sections
5. Entity consistency: beneficiary data never appears in contractor sections
Output the corrected version with updated quality scores.`,

  polish: `PASS 3 — FINAL POLISH
Apply final polish to the Pass 2 output (provided as previousPass).
1. Grammar and spelling: fix any remaining errors
2. Terminology: ensure consistent use of domain terms throughout
3. Romanian diacritics: ș ț ă â î (NEVER cedilla forms ş ţ)
4. Date format: DD.MM.YYYY
5. Amount format: 1.250.000,50 lei
6. Length: adjust narratives to target length from model map
7. Tone: ensure consistent formality level
Output the final polished version with updated quality scores.`,
} as const;

async function generatePass(
  input: WritingInput & { previousPass?: Record<string, unknown> },
  pass: 'generate' | 'coherence' | 'polish'
): Promise<AgentResult> {
  const modelMapSection = input.modelMap
    ? `\n\nModel Map (STYLE ONLY — patterns and vocabulary, no factual data):\n${JSON.stringify(input.modelMap, null, 2)}`
    : '';

  const previousPassSection = input.previousPass
    ? `\n\nPrevious Pass Output:\n${JSON.stringify(input.previousPass, null, 2)}`
    : '';

  return callAgentWithRetry(
    {
      model: AGENT_MODELS.writing,
      max_tokens: 16384,
      system: WRITING_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_field_completions',
          description: 'Save generated text for each template field with quality scores',
          input_schema: {
            type: 'object' as const,
            properties: {
              fields: {
                type: 'object' as const,
                description: 'Generated values per field ID',
              },
              qualityScores: {
                type: 'object' as const,
                description: 'Per-field quality scores on 4 dimensions (0-100)',
              },
            },
            required: ['fields'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `${PASS_INSTRUCTIONS[pass]}\n\nProject Data:\n${JSON.stringify(input.projectData, null, 2)}\n\nDraft Plan:\n${JSON.stringify(input.draftPlan, null, 2)}${modelMapSection}${previousPassSection}`,
        },
      ],
    },
    'save_field_completions'
  );
}
