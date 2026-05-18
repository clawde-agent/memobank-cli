import type { RecallResult } from '../types';

export function rrfMerge(
  textResults: RecallResult[],
  vectorResults: RecallResult[],
  k = 60
): RecallResult[] {
  const scores = new Map<string, number>();
  const byName = new Map<string, RecallResult>();

  for (const [rank, r] of textResults.entries()) {
    const s = (scores.get(r.memory.name) ?? 0) + 1 / (k + rank + 1);
    scores.set(r.memory.name, s);
    byName.set(r.memory.name, r);
  }
  for (const [rank, r] of vectorResults.entries()) {
    const s = (scores.get(r.memory.name) ?? 0) + 1 / (k + rank + 1);
    scores.set(r.memory.name, s);
    byName.set(r.memory.name, r);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, score]) => ({ ...byName.get(name)!, score }));
}
