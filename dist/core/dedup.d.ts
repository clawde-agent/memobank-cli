import type { PendingCandidate } from './store';
import type { MemoryFile } from '../types';
export type DedupLLM = (pairs: Array<{
    candidate: PendingCandidate;
    existing: MemoryFile;
}>) => Promise<Array<'DUPLICATE' | 'KEEP_BOTH'>>;
export declare function deduplicate(candidates: PendingCandidate[], existing: MemoryFile[], llm?: DedupLLM): Promise<{
    toWrite: PendingCandidate[];
    toSkip: PendingCandidate[];
}>;
export interface DedupBatchAction {
    action: 'store' | 'skip' | 'update' | 'merge';
    targetName?: string;
    updatedContent?: string;
}
export type DedupBatchLLM = (items: Array<{
    candidate: PendingCandidate;
    existing: MemoryFile;
}>) => Promise<DedupBatchAction[]>;
export interface DedupBatchResult {
    toWrite: PendingCandidate[];
    toSkip: PendingCandidate[];
    toUpdate: Array<{
        candidate: PendingCandidate;
        targetName: string;
        updatedContent?: string;
    }>;
}
export declare function dedupLLMBatch(candidates: PendingCandidate[], existing: MemoryFile[], llm?: DedupBatchLLM): Promise<DedupBatchResult>;
//# sourceMappingURL=dedup.d.ts.map