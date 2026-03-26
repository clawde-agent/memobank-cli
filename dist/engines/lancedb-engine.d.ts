/**
 * LanceDB Engine
 * Vector search engine using LanceDB with hybrid BM25 + vector search
 */
import type { MemoryFile, RecallResult } from '../types';
import type { EngineAdapter } from './engine-adapter';
import type { EmbeddingGenerator } from '../core/embedding';
export declare class LanceDbEngine implements EngineAdapter {
    private dbPath;
    private embeddingGenerator;
    private db;
    private table;
    private readonly tableName;
    private readonly indexDirName;
    constructor(dbPath: string, embeddingGenerator: EmbeddingGenerator);
    /**
     * Initialize LanceDB connection and table
     */
    private init;
    /**
     * Index memories into LanceDB
     * @param memories - Memories to index
     * @param incremental - Whether to update incrementally or rebuild
     */
    index(memories: MemoryFile[], incremental: boolean): Promise<void>;
    /**
     * Search for memories using hybrid vector + BM25 search
     * @param query - Search query string
     * @param memories - All memories (fallback for text search)
     * @param topK - Maximum number of results
     * @returns Array of recall results sorted by score
     */
    search(query: string, memories: MemoryFile[], topK: number): Promise<RecallResult[]>;
    /**
     * Get combined text for embedding generation
     */
    private getEmbeddingText;
    /**
     * Generate unique memory ID
     */
    private memoryId;
    /**
     * Hash memory content for change detection
     */
    private contentHash;
    /**
     * Convert LanceDB row to MemoryFile with defensive null checks
     */
    private rowToMemory;
    /**
     * Infer memory type from name/path
     */
    private inferType;
}
//# sourceMappingURL=lancedb-engine.d.ts.map