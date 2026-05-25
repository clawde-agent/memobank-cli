import { rank } from '../src/core/recall-ranker';
import type { RecallResult } from '../src/types';

function makeResult(path: string, score: number): RecallResult {
  return {
    score,
    memory: {
      path,
      name: path,
      type: 'lesson',
      description: '',
      tags: [],
      created: '2026-01-01',
      confidence: 'medium',
      status: 'active',
      content: '',
    },
  };
}

describe('rank', () => {
  it('returns results sorted by score descending', () => {
    const results = [makeResult('a', 0.3), makeResult('b', 0.8), makeResult('c', 0.5)];
    const ranked = rank(results);
    expect(ranked.map((r) => r.memory.path)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const results = [makeResult('a', 0.5), makeResult('b', 0.9)];
    const before = [...results];
    rank(results);
    expect(results).toEqual(before);
  });

  it('applies graph boost for linked memories', () => {
    const results = [makeResult('linked', 0.5), makeResult('unlinked', 0.5)];
    // depth=0 → boost = 0.5 / (0 + 1) = 0.5, capped at 1.0
    const graphScores = new Map([['linked', 0]]);
    const ranked = rank(results, { graphScores });
    expect(ranked[0].memory.path).toBe('linked');
    expect(ranked[0].score).toBeGreaterThan(0.5);
  });

  it('applies access-frequency boost for recalled memories', () => {
    const results = [makeResult('recalled', 0.5), makeResult('fresh', 0.5)];
    const accessLogs = {
      recalled: {
        memoryPath: 'recalled',
        lastAccessed: new Date(),
        accessCount: 50,
        recallQueries: [],
        epochAccessCount: 0,
        team_epoch: new Date().toISOString(),
      },
    };
    const ranked = rank(results, { accessLogs });
    expect(ranked[0].memory.path).toBe('recalled');
    expect(ranked[0].score).toBeGreaterThan(0.5);
  });

  it('caps boosted scores at 1.0', () => {
    const results = [makeResult('m', 0.95)];
    const graphScores = new Map([['m', 0]]);
    const ranked = rank(results, { graphScores });
    expect(ranked[0].score).toBeLessThanOrEqual(1.0);
  });
});
