import { mergeResults } from '../src/core/result-merger';
import type { RecallResult, SymbolResult } from '../src/types';

function makeMemoryResult(score: number): RecallResult {
  return {
    memory: {
      path: '/tmp/test.md',
      name: 'test-memory',
      type: 'lesson',
      description: 'A test memory',
      tags: [],
      created: '2026-01-01',
      content: 'Content here',
    },
    score,
  };
}

function makeSymbolResult(score: number, name: string): SymbolResult {
  return {
    symbol: {
      name,
      qualifiedName: name,
      kind: 'function',
      file: 'src/test.ts',
      lineStart: 1,
      lineEnd: 10,
      signature: `${name}(): void`,
      isExported: true,
    },
    score,
  };
}

describe('mergeResults', () => {
  it('returns empty when both inputs are empty', () => {
    expect(mergeResults([], [], 5)).toHaveLength(0);
  });

  it('returns only memories when no symbols', () => {
    const memories = [makeMemoryResult(0.9), makeMemoryResult(0.5)];
    const merged = mergeResults(memories, [], 5);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('memory');
  });

  it('returns only symbols when no memories', () => {
    const symbols = [makeSymbolResult(0.8, 'foo'), makeSymbolResult(0.4, 'bar')];
    const merged = mergeResults([], symbols, 5);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('symbol');
  });

  it('interleaves memories and symbols by normalized score', () => {
    const memories = [makeMemoryResult(0.9)];
    const symbols = [makeSymbolResult(0.95, 'topFn')];
    const merged = mergeResults(memories, symbols, 5);
    expect(merged[0].type).toBe('symbol');
    expect(merged[1].type).toBe('memory');
  });

  it('respects topK limit', () => {
    const memories = [makeMemoryResult(0.9), makeMemoryResult(0.8), makeMemoryResult(0.7)];
    const symbols = [makeSymbolResult(0.6, 'fn1'), makeSymbolResult(0.5, 'fn2')];
    const merged = mergeResults(memories, symbols, 3);
    expect(merged).toHaveLength(3);
  });

  it('all scores are between 0 and 1', () => {
    const memories = [makeMemoryResult(100), makeMemoryResult(50)];
    const symbols = [makeSymbolResult(200, 'x')];
    const merged = mergeResults(memories, symbols, 10);
    for (const r of merged) {
      expect(r.normalizedScore).toBeGreaterThanOrEqual(0);
      expect(r.normalizedScore).toBeLessThanOrEqual(1);
    }
  });
});
