import { AGENT_MODELS } from '@/types/pipeline';
import { MODEL_SYSTEM_PROMPT } from './prompts/model';
import { callAgentWithRetry, type AgentResult } from './client';

export interface ModelAgentInput {
  documents: {
    filename: string;
    content: string;
  }[];
}

export async function runModelAgent(input: ModelAgentInput): Promise<AgentResult> {
  const documentsText = input.documents
    .map((d) => `--- Model Document: ${d.filename} ---\n${d.content}`)
    .join('\n\n');

  const result = await callAgentWithRetry(
    {
      model: AGENT_MODELS.model,
      max_tokens: 8192,
      system: MODEL_SYSTEM_PROMPT,
      tools: [
        {
          name: 'save_model_map',
          description: 'Save style and rhetorical analysis. MUST NOT contain any factual data.',
          input_schema: {
            type: 'object' as const,
            properties: {
              sections: {
                type: 'array' as const,
                description: 'Section-level style analysis',
              },
              globalStyle: {
                type: 'object' as const,
                description: 'Document-wide style properties',
              },
              rhetoricalPatterns: {
                type: 'object' as const,
                description: 'Rhetorical patterns: openings, transitions, conclusions',
              },
              domainVocabulary: {
                type: 'object' as const,
                description: 'Preferred terms, standard phrases, excluded terms',
              },
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
    },
    'save_model_map'
  );

  // Post-validation: check for data leakage indicators
  const outputStr = JSON.stringify(result.output);
  const leakagePatterns = [
    /\bRO\d{2,10}\b/,       // CUI pattern
    /\bRO\d{2}[A-Z]{4}\b/,  // IBAN start
    /\d{1,3}\.\d{3}\.\d{3}/,// Romanian number format (amounts)
    /\d{2}\.\d{2}\.\d{4}/,  // Date DD.MM.YYYY
  ];

  const warnings: string[] = [];
  for (const pattern of leakagePatterns) {
    if (pattern.test(outputStr)) {
      warnings.push(`Possible data leakage detected: ${pattern.source}`);
    }
  }

  if (warnings.length > 0) {
    console.warn('[MODEL_AGENT] Data leakage warnings:', warnings);
    // Add warnings to output for downstream visibility
    result.output['_dataLeakageWarnings'] = warnings;
  }

  return result;
}
