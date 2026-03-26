// tests/dedup.test.ts
import { deduplicate } from '../src/core/dedup';
import type { PendingCandidate } from '../src/core/store';
import type { MemoryFile } from '../src/types';

function makeCandidate(name: string, description: string): PendingCandidate {
  return { name, type: 'lesson', description, tags: [], confidence: 'high', content: 'body' };
}

function makeMemory(name: string, description: string): MemoryFile {
  return {
    name,
    type: 'lesson',
    description,
    tags: [],
    confidence: 'high',
    status: 'active',
    content: 'body',
    path: '/fake/path.md',
    created: '2026-01-01',
  };
}

describe('deduplicate — Stage 1 (no LLM)', () => {
  it('skips candidate whose name exactly matches an existing memory', async () => {
    const c = makeCandidate('api-timeout', 'handle api timeout errors');
    const e = makeMemory('api-timeout', 'different description');
    const result = await deduplicate([c], [e]);
    expect(result.toWrite).toHaveLength(0);
    expect(result.toSkip).toHaveLength(1);
  });

  it('skips candidate with Jaccard >= 0.8 on name+description', async () => {
    const c = makeCandidate('api-timeout-handling', 'handle api timeout errors in requests');
    const e = makeMemory('api-timeout-handler', 'handle api timeout errors in requests');
    const result = await deduplicate([c], [e]);
    expect(result.toSkip).toHaveLength(1);
  });

  it('writes candidate with Jaccard < 0.4 (clearly different)', async () => {
    const c = makeCandidate('pnpm-setup', 'use pnpm instead of npm for package management');
    const e = makeMemory('api-timeout', 'handle api timeout errors in requests');
    const result = await deduplicate([c], [e]);
    expect(result.toWrite).toHaveLength(1);
    expect(result.toSkip).toHaveLength(0);
  });

  it('writes ambiguous candidate (0.4–0.8) when no LLM provided (KEEP_BOTH)', async () => {
    const c = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const result = await deduplicate([c], [e]);
    expect(result.toWrite).toHaveLength(1);
  });

  it('writes candidate when there are no existing memories', async () => {
    const c = makeCandidate('new-lesson', 'something new');
    const result = await deduplicate([c], []);
    expect(result.toWrite).toHaveLength(1);
  });
});

describe('deduplicate — Stage 2 (with LLM)', () => {
  it('skips ambiguous candidate when LLM returns DUPLICATE', async () => {
    const c = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const mockLLM = jest.fn().mockResolvedValue(['DUPLICATE']);
    const result = await deduplicate([c], [e], mockLLM);
    expect(result.toSkip).toHaveLength(1);
    expect(mockLLM).toHaveBeenCalledTimes(1);
  });

  it('writes ambiguous candidate when LLM returns KEEP_BOTH', async () => {
    const c = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const mockLLM = jest.fn().mockResolvedValue(['KEEP_BOTH']);
    const result = await deduplicate([c], [e], mockLLM);
    expect(result.toWrite).toHaveLength(1);
  });

  it('treats ambiguous as KEEP_BOTH when LLM throws, Stage 1 writes unaffected', async () => {
    const ambiguous = makeCandidate('api-retry-logic', 'retry failed api calls with backoff');
    const clearlyNew = makeCandidate('pnpm-setup', 'use pnpm instead of npm');
    const e = makeMemory('api-timeout-handling', 'handle api timeout with retry backoff');
    const mockLLM = jest.fn().mockRejectedValue(new Error('LLM unavailable'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await deduplicate([ambiguous, clearlyNew], [e], mockLLM);
    expect(result.toWrite).toHaveLength(2);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Stage 2'));
    warnSpy.mockRestore();
  });

  it('does NOT call LLM when all candidates are resolved in Stage 1', async () => {
    const c = makeCandidate('api-timeout', 'exact match');
    const e = makeMemory('api-timeout', 'exact match');
    const mockLLM = jest.fn();
    await deduplicate([c], [e], mockLLM);
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it('sends all ambiguous pairs in a single LLM call', async () => {
    const existing = [
      makeMemory('api-timeout-handling', 'handle api timeout with retry backoff'),
      makeMemory('db-connection-pool', 'manage database connection pools'),
    ];
    const candidates = [
      makeCandidate('api-retry-logic', 'retry failed api calls with backoff'),
      makeCandidate('db-pool-management', 'configure database connection pools'),
    ];
    const mockLLM = jest.fn().mockResolvedValue(['KEEP_BOTH', 'DUPLICATE']);
    const result = await deduplicate(candidates, existing, mockLLM);
    expect(mockLLM).toHaveBeenCalledTimes(1);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ candidate: candidates[0] }),
        expect.objectContaining({ candidate: candidates[1] }),
      ])
    );
    expect(result.toWrite).toHaveLength(1);
    expect(result.toSkip).toHaveLength(1);
  });
});
