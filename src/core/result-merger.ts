import type { RecallResult, SymbolResult } from '../types';

export type MergedItem =
  | { type: 'memory'; result: RecallResult; normalizedScore: number }
  | { type: 'symbol'; result: SymbolResult; normalizedScore: number };

export function mergeResults(
  memories: RecallResult[],
  symbols: SymbolResult[],
  topK: number
): MergedItem[] {
  // Combine all scores to find global min/max
  const allScores = [...memories.map((r) => r.score), ...symbols.map((r) => r.score)];
  const globalMin = allScores.length > 0 ? Math.min(...allScores) : 0;
  const globalMax = allScores.length > 0 ? Math.max(...allScores) : 0;
  const globalRange = globalMax - globalMin;

  const normalizeGlobal = (score: number): number => {
    if (globalRange === 0) {
      return 1.0;
    }
    return (score - globalMin) / globalRange;
  };

  const memNorm = memories.map((r) => normalizeGlobal(r.score));
  const symNorm = symbols.map((r) => normalizeGlobal(r.score));

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

  items.sort((a, b) => b.normalizedScore - a.normalizedScore);
  return items.slice(0, topK);
}
