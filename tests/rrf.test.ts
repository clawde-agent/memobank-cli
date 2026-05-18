import { rrfMerge } from '../src/core/rrf';
import type { RecallResult } from '../src/types';

function makeResult(name: string, score: number): RecallResult {
  return {
    memory: {
      path: `/fake/${name}.md`,
      name,
      type: 'lesson',
      description: `desc for ${name}`,
      tags: [],
      created: '2026-01-01',
      content: '',
    },
    score,
  };
}

describe('rrfMerge', () => {
  it('returns empty array when both inputs are empty', () => {
    expect(rrfMerge([], [])).toEqual([]);
  });

  it('returns text results when vector list is empty', () => {
    const text = [makeResult('alpha', 0.9), makeResult('beta', 0.7)];
    const merged = rrfMerge(text, []);
    expect(merged.map((r: RecallResult) => r.memory.name)).toEqual(['alpha', 'beta']);
  });

  it('returns vector results when text list is empty', () => {
    const vector = [makeResult('gamma', 0.8), makeResult('delta', 0.6)];
    const merged = rrfMerge([], vector);
    expect(merged.map((r: RecallResult) => r.memory.name)).toEqual(['gamma', 'delta']);
  });

  it('boosts a result that appears in both lists', () => {
    const text = [makeResult('shared', 0.9), makeResult('text-only', 0.8)];
    const vector = [makeResult('shared', 0.9), makeResult('vec-only', 0.7)];
    const merged = rrfMerge(text, vector);
    expect(merged[0]!.memory.name).toBe('shared');
  });

  it('uses RRF formula: score = 1/(k + rank + 1), default k=60', () => {
    const text = [makeResult('a', 1.0)];
    const vector = [makeResult('b', 1.0)];
    const merged = rrfMerge(text, vector);
    expect(merged[0]!.score).toBeCloseTo(1 / 61, 5);
    expect(merged[1]!.score).toBeCloseTo(1 / 61, 5);
  });

  it('respects custom k parameter', () => {
    const text = [makeResult('a', 1.0)];
    const merged = rrfMerge(text, [], 10);
    expect(merged[0]!.score).toBeCloseTo(1 / 11, 5);
  });

  it('handles 10 results from each list with no overlap', () => {
    const text = Array.from({ length: 10 }, (_, i) => makeResult(`t${i}`, 1 - i * 0.05));
    const vec = Array.from({ length: 10 }, (_, i) => makeResult(`v${i}`, 1 - i * 0.05));
    const merged = rrfMerge(text, vec);
    expect(merged).toHaveLength(20);
    expect(merged[0]!.score).toBeCloseTo(1 / 61, 5);
  });

  it('is deterministic: identical inputs produce identical output', () => {
    const text = [makeResult('x', 0.9), makeResult('y', 0.7)];
    const vec = [makeResult('y', 0.8), makeResult('z', 0.6)];
    const a = rrfMerge(text, vec);
    const b = rrfMerge(text, vec);
    expect(a.map((r: RecallResult) => r.memory.name)).toEqual(
      b.map((r: RecallResult) => r.memory.name)
    );
  });
});
