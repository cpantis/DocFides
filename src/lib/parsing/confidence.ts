/**
 * Confidence scoring and threshold evaluation for extraction blocks.
 */

import type { ExtractionBlock, ConfidenceLevel, ConfidenceResult } from './types';

/** Threshold: auto-accept */
const HIGH_THRESHOLD = 90;
/** Threshold: user review recommended */
const MEDIUM_THRESHOLD = 70;

export function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

export function evaluateBlockConfidence(block: ExtractionBlock): ConfidenceResult {
  const warnings: string[] = [...block.warnings];

  let adjustedScore = block.confidence;

  // Penalize blocks with very short text (likely OCR artifacts)
  if (block.type === 'text' && typeof block.content === 'string') {
    const textLength = block.content.trim().length;
    if (textLength < 10 && adjustedScore > 50) {
      adjustedScore -= 15;
      warnings.push('Very short text — may be an OCR artifact');
    }
  }

  // Penalize blocks that came from EasyOCR fallback (inherently lower quality)
  if (block.source === 'easyocr') {
    adjustedScore = Math.min(adjustedScore, 85);
  }

  // Table blocks from img2table get a small penalty (less reliable than Camelot)
  if (block.type === 'table' && block.source === 'img2table') {
    adjustedScore = Math.min(adjustedScore, 88);
  }

  // Ensure score stays in valid range
  adjustedScore = Math.max(0, Math.min(100, adjustedScore));

  return {
    score: Math.round(adjustedScore * 10) / 10,
    level: getConfidenceLevel(adjustedScore),
    warnings,
  };
}

export function calculateOverallConfidence(blocks: ExtractionBlock[]): ConfidenceResult {
  if (blocks.length === 0) {
    return { score: 0, level: 'low', warnings: ['No extraction blocks available'] };
  }

  const results = blocks.map(evaluateBlockConfidence);
  const scores = results.map((r) => r.score);
  const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const allWarnings = results.flatMap((r) => r.warnings);

  // Unique warnings only
  const uniqueWarnings = [...new Set(allWarnings)];

  return {
    score: Math.round(avgScore * 10) / 10,
    level: getConfidenceLevel(avgScore),
    warnings: uniqueWarnings,
  };
}

export function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'text-success';
    case 'medium':
      return 'text-amber-500';
    case 'low':
      return 'text-error';
  }
}

export function getConfidenceBgColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'high':
      return 'bg-green-50';
    case 'medium':
      return 'bg-amber-50';
    case 'low':
      return 'bg-red-50';
  }
}
