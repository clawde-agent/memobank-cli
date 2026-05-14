/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 */
import type { RecallResult, MemoConfig, MemoryScope, SymbolResult } from '../types';
import type { EngineAdapter } from '../engines/engine-adapter';
/**
 * Recall memories for a query
 */
export declare function recall(query: string, repoRoot: string, config: MemoConfig, engine?: EngineAdapter, scope?: MemoryScope | 'all', explain?: boolean, withCode?: boolean): Promise<{
    results: RecallResult[];
    markdown: string;
    symbolResults?: SymbolResult[];
}>;
/**
 * Write recall results to MEMORY.md
 */
export declare function writeRecallResults(repoRoot: string, results: RecallResult[], query: string, engine: string): void;
//# sourceMappingURL=retriever.d.ts.map