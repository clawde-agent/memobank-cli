import type { RecallResult, SymbolResult } from '../types';
export type MergedItem = {
    type: 'memory';
    result: RecallResult;
    normalizedScore: number;
} | {
    type: 'symbol';
    result: SymbolResult;
    normalizedScore: number;
};
export declare function mergeResults(memories: RecallResult[], symbols: SymbolResult[], topK: number): MergedItem[];
//# sourceMappingURL=result-merger.d.ts.map