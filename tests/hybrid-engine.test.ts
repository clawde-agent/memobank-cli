import { HybridEngine } from '../src/engines/hybrid-engine';
import type { EngineAdapter } from '../src/engines/engine-adapter';
import type { MemoryFile, RecallResult } from '../src/types';

function makeMemory(name: string): MemoryFile {
  return {
    path: `/fake/${name}.md`,
    name,
    type: 'lesson',
    description: `desc ${name}`,
    tags: [],
    created: '2026-01-01',
    content: '',
  };
}

function makeResult(memory: MemoryFile, score: number): RecallResult {
  return { memory, score };
}

class StubEngine implements EngineAdapter {
  constructor(private readonly results: RecallResult[]) {}
  async search(_query: string, _memories: MemoryFile[], _topK: number): Promise<RecallResult[]> {
    return this.results;
  }
}

describe('HybridEngine', () => {
  const memories = [makeMemory('alpha'), makeMemory('beta'), makeMemory('gamma')];

  it('merges results from both engines using RRF, boosting shared results', async () => {
    const textR = [makeResult(memories[0]!, 0.9), makeResult(memories[1]!, 0.7)];
    const vecR = [makeResult(memories[1]!, 0.8), makeResult(memories[2]!, 0.6)];
    const engine = new HybridEngine(new StubEngine(textR), new StubEngine(vecR));
    const results = await engine.search('query', memories, 5);
    expect(results[0]!.memory.name).toBe('beta');
    expect(results).toHaveLength(3);
  });

  it('truncates to topK', async () => {
    const textR = memories.map((m, i) => makeResult(m, 1 - i * 0.1));
    const vecR = memories.map((m, i) => makeResult(m, 1 - i * 0.1));
    const engine = new HybridEngine(new StubEngine(textR), new StubEngine(vecR));
    const results = await engine.search('query', memories, 2);
    expect(results).toHaveLength(2);
  });

  it('runs both engines in parallel (elapsed < 55ms for 30ms each)', async () => {
    class TimedEngine implements EngineAdapter {
      constructor(
        private readonly delayMs: number,
        private readonly r: RecallResult[]
      ) {}
      async search(_q: string, _m: MemoryFile[], _k: number): Promise<RecallResult[]> {
        await new Promise((res) => setTimeout(res, this.delayMs));
        return this.r;
      }
    }
    const t1 = Date.now();
    const engine = new HybridEngine(
      new TimedEngine(30, [makeResult(memories[0]!, 0.9)]),
      new TimedEngine(30, [makeResult(memories[1]!, 0.8)])
    );
    await engine.search('q', memories, 5);
    expect(Date.now() - t1).toBeLessThan(55);
  });
});
