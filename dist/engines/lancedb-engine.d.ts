/**
 * LanceDB Engine (Optional)
 * This is a placeholder for the LanceDB vector search engine.
 * To use this feature, install: npm install vectordb openai
 *
 * This file provides type stubs only. The actual implementation
 * should be added when needed.
 */
import { MemoryFile, RecallResult } from '../types';
import { EngineAdapter } from './engine-adapter';
export declare class LanceDbEngine implements EngineAdapter {
    search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>;
    index(memories: MemoryFile[], incremental: boolean): Promise<void>;
}
//# sourceMappingURL=lancedb-engine.d.ts.map