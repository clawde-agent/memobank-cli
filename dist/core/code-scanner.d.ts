import type { CodeSymbol, CodeEdge, IndexedLanguage } from '../types';
export declare const SUPPORTED_EXTENSIONS: Map<string, IndexedLanguage>;
export declare function detectLanguage(filePath: string): IndexedLanguage | null;
export interface ScanFileResult {
    symbols: CodeSymbol[];
    edges: CodeEdge[];
    hash: string;
}
export declare function scanFile(filePath: string, scanRoot: string): ScanFileResult;
export declare function hashFile(filePath: string): string;
//# sourceMappingURL=code-scanner.d.ts.map