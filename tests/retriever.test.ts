import type { RecallResult } from '../src/types';
import type { MemoryFile } from '../src/types';

// These imports will fail until Task 8 extracts and exports the functions.
import { budgetResults, loadCodeIndex } from '../src/core/retriever';

function makeResult(name: string, body: string): RecallResult {
  const memory: MemoryFile = {
    name,
    type: 'lesson',
    description: 'desc',
    tags: [],
    confidence: 'high',
    status: 'active',
    content: body,
    path: `/fake/${name}.md`,
    created: '2026-01-01',
  };
  return { memory, score: 0.9 };
}

describe('budgetResults', () => {
  it('returns all results when total tokens are under budget', () => {
    const results = [makeResult('a', 'short'), makeResult('b', 'short')];
    // Budget large enough to fit both
    const kept = budgetResults(results, 10_000);
    expect(kept).toHaveLength(2);
  });

  it('trims from the end when total tokens exceed budget', () => {
    // Create results where body is large enough to exceed a tight budget
    const longBody = 'x'.repeat(5000);
    const results = [
      makeResult('first', longBody),
      makeResult('second', longBody),
      makeResult('third', longBody),
    ];
    // Budget = 1000 tokens ≈ 4000 chars — only "first" should fit
    const kept = budgetResults(results, 1000);
    // Each result costs ~1300+ tokens approximated; budget=1000 fits only one
    expect(kept).toHaveLength(1);
    expect(kept[0].memory.name).toBe('first');
  });

  it('returns at least one result even if it exceeds budget', () => {
    const hugeBody = 'x'.repeat(100_000);
    const results = [makeResult('only', hugeBody)];
    const kept = budgetResults(results, 100); // tiny budget
    expect(kept).toHaveLength(1); // never return empty when there are results
  });

  it('returns empty array when input is empty', () => {
    expect(budgetResults([], 10_000)).toHaveLength(0);
  });
});

describe('loadCodeIndex', () => {
  it('returns null when code index does not exist', async () => {
    const result = await loadCodeIndex('/definitely/nonexistent/path', true);
    expect(result).toBeNull();
  });

  it('returns null when withCode is false', async () => {
    const result = await loadCodeIndex('/any/path', false);
    expect(result).toBeNull();
  });
});
