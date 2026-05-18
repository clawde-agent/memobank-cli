import type { EngineAdapter } from './engine-adapter';
import type { MemoryFile, RecallResult } from '../types';
import { rrfMerge } from '../core/rrf';

export class HybridEngine implements EngineAdapter {
  constructor(
    private readonly textEngine: EngineAdapter,
    private readonly vectorEngine: EngineAdapter,
    private readonly k: number = 60
  ) {}

  async search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]> {
    const [textResults, vectorResults] = await Promise.all([
      this.textEngine.search(query, memories, topK),
      this.vectorEngine.search(query, memories, topK),
    ]);
    return rrfMerge(textResults, vectorResults, this.k).slice(0, topK);
  }
}
