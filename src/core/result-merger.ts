import type { RecallResult, SymbolResult } from '../types';

export type MergedItem =
  | { type: 'memory'; result: RecallResult; normalizedScore: number }
  | { type: 'symbol'; result: SymbolResult; normalizedScore: number };

/**
 * Normalizes scores within [0, 1] using min-max scaling.
 * Returns empty array if input is empty.
 * If all scores are identical, returns array of 1.0s.
 */
function normalize(scores: number[]): number[] {
  if (scores.length === 0) {return [];}
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  if (range === 0) {
    return scores.map(() => 1.0);
  }

  return scores.map((score) => (score - min) / range);
}

export function mergeResults(
  memories: RecallResult[],
  symbols: SymbolResult[],
  topK: number
): MergedItem[] {
  // Per-stream normalization: memories normalized against their own range,
  // symbols against their own range
  const memNorm = normalize(memories.map((r) => r.score));
  const symNorm = normalize(symbols.map((r) => r.score));

  const items: MergedItem[] = [
    ...memories.map((r, i) => ({
      type: 'memory' as const,
      result: r,
      normalizedScore: memNorm[i] ?? 0,
    })),
    ...symbols.map((r, i) => ({
      type: 'symbol' as const,
      result: r,
      normalizedScore: symNorm[i] ?? 0,
    })),
  ];

  // Sort by normalized score (descending), with tiebreaker: symbols before memories
  items.sort((a, b) => {
    const scoreDiff = b.normalizedScore - a.normalizedScore;
    if (scoreDiff !== 0) {return scoreDiff;}
    // On tie, symbols sort before memories (code results are more precise)
    if (a.type === 'symbol' && b.type !== 'symbol') {return -1;}
    if (b.type === 'symbol' && a.type !== 'symbol') {return 1;}
    return 0;
  });

  return items.slice(0, topK);
}
