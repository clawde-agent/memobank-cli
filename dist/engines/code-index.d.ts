import type { CodeSymbol, CodeEdge, SymbolResult } from '../types';
export declare class CodeIndex {
    private db;
    constructor(dbPath: string);
    static isAvailable(): boolean;
    static getDbPath(repoRoot: string): string;
    close(): void;
    needsReindex(filePath: string, hash: string): boolean;
    upsertFile(filePath: string, language: string, hash: string, mtime: number): void;
    deleteFile(filePath: string): void;
    upsertSymbols(filePath: string, symbols: CodeSymbol[], edges: CodeEdge[]): void;
    search(query: string, topK: number): SymbolResult[];
    getRefs(symbolName: string): SymbolResult[];
    getStats(): {
        files: number;
        symbols: number;
        edges: number;
    };
}
//# sourceMappingURL=code-index.d.ts.map