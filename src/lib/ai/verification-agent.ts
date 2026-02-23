import { AGENT_MODELS } from '@/types/pipeline';
import { VERIFICATION_SYSTEM_PROMPT } from './prompts/verification';
import { callAgentWithRetry, type AgentResult } from './client';

export interface VerificationInput {
  projectData: Record<string, unknown>;
  modelMap?: Record<string, unknown>;
  fieldCompletions: Record<string, unknown>;
}

/**
 * Verification Agent — quality and data integrity checks using Opus 4.6.
 *
 * Checks: data integrity, model data leakage, cross-entity contamination,
 * text quality, Romanian formatting, diacritics, and length compliance.
 */
export async function runVerificationAgent(input: VerificationInput): Promise<AgentResult> {
  const modelMapSection = input.modelMap
    ? `\n\nModel Map (check for data leakage FROM this — no model data should appear in generated fields):\n${JSON.stringify(input.modelMap, null, 2)}`
    : '';

  return callAgentWithRetry(
    {
      model: AGENT_MODELS.verification,
      max_tokens: 8192,
      temperature: 0.3,
      system: VERIFICATION_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_quality_report',
          description: 'Save the quality verification report with scores and issues',
          input_schema: {
            type: 'object' as const,
            properties: {
              global_score: {
                type: 'number' as const,
                description: 'Overall quality score 0-100',
              },
              errors: {
                type: 'array' as const,
                description: 'Issues that MUST be fixed before export',
                items: {
                  type: 'object' as const,
                  properties: {
                    fieldId: { type: 'string' as const },
                    issue: { type: 'string' as const },
                    severity: { type: 'string' as const, enum: ['critical', 'error'] },
                    suggestedFix: { type: 'string' as const },
                  },
                  required: ['fieldId', 'issue', 'severity'],
                },
              },
              warnings: {
                type: 'array' as const,
                description: 'Issues that SHOULD be reviewed',
                items: {
                  type: 'object' as const,
                  properties: {
                    fieldId: { type: 'string' as const },
                    issue: { type: 'string' as const },
                    severity: { type: 'string' as const, enum: ['warning'] },
                  },
                  required: ['fieldId', 'issue'],
                },
              },
              suggestions: {
                type: 'array' as const,
                description: 'Nice-to-have improvements',
                items: { type: 'string' as const },
              },
              field_scores: {
                type: 'object' as const,
                description: 'Per-field quality scores: accuracy, style, completeness, coherence (0-100)',
              },
              data_leakage_check: {
                type: 'object' as const,
                description: 'Results of model data leakage verification',
                properties: {
                  passed: { type: 'boolean' as const },
                  violations: { type: 'array' as const, items: { type: 'string' as const } },
                },
              },
            },
            required: ['global_score', 'errors', 'warnings', 'field_scores'],
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Verify the generated document for data integrity, text quality, and model data leakage.

Perform ALL of these checks:
1. DATA INTEGRITY: values consistent across fields, financial totals correct, cross-refs valid
2. MODEL DATA LEAKAGE: no factual data from model_map appears in generated fields
3. CROSS-ENTITY CONTAMINATION: beneficiary data never mixed with contractor data
4. ROMANIAN FORMATTING: dates DD.MM.YYYY, amounts 1.250.000,50 lei, correct diacritics (ș ț ă â î)
5. TEXT QUALITY: coherence, no repetition, consistent terminology, appropriate length
6. COMPLETENESS: all required fields filled, no empty narratives

Project Data (source of truth for all factual data):
${JSON.stringify(input.projectData, null, 2)}

Generated Fields (to verify):
${JSON.stringify(input.fieldCompletions, null, 2)}${modelMapSection}`,
        },
      ],
    },
    'save_quality_report'
  );
}
