/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 */
import { RecallResult, MemoConfig, MemoryScope } from '../types';
import { EngineAdapter } from '../engines/engine-adapter';
/**
 * Recall memories for a query
 */
export declare function recall(query: string, repoRoot: string, config: MemoConfig, engine?: EngineAdapter, scope?: MemoryScope | 'all', explain?: boolean): Promise<{
    results: RecallResult[];
    markdown: string;
}>;
/**
 * Write recall results to MEMORY.md
 */
export declare function writeRecallResults(repoRoot: string, results: RecallResult[], query: string, engine: string): void;
//# sourceMappingURL=retriever.d.ts.map