/**
 * File I/O layer for memobank
 * Reads and writes .md files with YAML frontmatter
 */
import { MemoryFile } from '../types';
/**
 * Find memobank root directory
 * Resolution order:
 * 1. --repo CLI flag (passed as parameter)
 * 2. MEMOBANK_REPO env var
 * 3. meta/config.yaml in cwd or parent dirs (walk up)
 * 4. ~/.memobank/<git-repo-name>/
 * 5. ~/.memobank/default/
 */
export declare function findRepoRoot(cwd: string, repoFlag?: string): string;
/**
 * Load all memory files from a repo
 */
export declare function loadAll(repoRoot: string): MemoryFile[];
/**
 * Load a single memory file
 */
export declare function loadFile(filePath: string): MemoryFile;
/**
 * Write a new memory file
 * Creates filename from name + created date
 */
export declare function writeMemory(repoRoot: string, memory: Omit<MemoryFile, 'path'>): string;
/**
 * Update MEMORY.md with recall results
 */
export declare function writeMemoryMd(repoRoot: string, results: Array<{
    memory: MemoryFile;
    score: number;
}>, query: string, engine: string): void;
/**
 * Read MEMORY.md content
 */
export declare function readMemoryMd(repoRoot: string): string | null;
//# sourceMappingURL=store.d.ts.map