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
//# sourceMappingURL=dedup.d.ts.map