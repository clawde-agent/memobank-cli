import type { EngineAdapter } from './engine-adapter';
import type { MemoryFile, RecallResult } from '../types';
export declare class HybridEngine implements EngineAdapter {
    private readonly textEngine;
    private readonly vectorEngine;
    private readonly k;
    constructor(textEngine: EngineAdapter, vectorEngine: EngineAdapter, k?: number);
    search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>;
}
//# sourceMappingURL=hybrid-engine.d.ts.map