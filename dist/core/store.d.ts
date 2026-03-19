/**
 * File I/O layer for memobank
 * Reads and writes .md files with YAML frontmatter
 */
import { MemoryFile, MemoryScope } from '../types';
export declare function findRepoRoot(cwd: string, repoFlag?: string): string;
export declare function getPersonalDir(repoRoot: string): string;
export declare function getTeamDir(repoRoot: string): string;
export declare function loadAll(repoRoot: string, scope?: MemoryScope): MemoryFile[];
/**
 * Load a single memory file
 */
export declare function loadFile(filePath: string): MemoryFile;
export declare function writeMemory(repoRoot: string, memory: Omit<MemoryFile, 'path' | 'scope'>): string;
export declare function migrateToPersonal(repoRoot: string): {
    migrated: string[];
    skipped: string[];
};
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