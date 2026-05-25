import type { RecallResult } from '../types';
import type { AccessLog } from './lifecycle-engine';

export interface RankOptions {
  graphScores?: Map<string, number>;
  accessLogs?: Record<string, AccessLog>;
}

export function rank(results: RecallResult[], opts: RankOptions = {}): RecallResult[] {
  let ranked = [...results];

  if (opts.graphScores && opts.graphScores.size > 0) {
    ranked = ranked.map((r) => {
      const depth = opts.graphScores!.get(r.memory.path);
      if (depth === undefined) return r;
      return { ...r, score: Math.min(1.0, r.score + 0.5 / (depth + 1)) };
    });
  }

  if (opts.accessLogs) {
    const logs = opts.accessLogs;
    ranked = ranked.map((result) => {
      const log = logs[result.memory.path];
      const accessCount = log?.accessCount ?? 0;
      const boost = Math.min(1.5, 1.0 + Math.log1p(accessCount) / 10);
      return { ...result, score: Math.min(1.0, result.score * boost) };
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
