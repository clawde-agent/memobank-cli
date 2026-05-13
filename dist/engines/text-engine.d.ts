/**
 * Text-based search engine
 * Uses keyword matching, tag filtering, and decay scoring
 * Zero external dependencies
 */
import type { MemoryFile, RecallResult } from '../types';
import type { EngineAdapter } from './engine-adapter';
export declare class TextEngine implements EngineAdapter {
    /**
     * Search for memories using keyword matching + decay scoring
     */
    search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>;
    /**
     * Tokenize a string into lowercase words
     */
    private tokenize;
    /**
     * Compute text match score for a memory (0-1)
     */
    private computeTextScore;
    /**
     * Compute match score for query tokens against field tokens (0-1)
     */
    private computeFieldMatchScore;
    /**
     * Index is a no-op for text engine - searches live files directly
     */
    index(_memories: MemoryFile[], _incremental: boolean): Promise<void>;
}
//# sourceMappingURL=text-engine.d.ts.map