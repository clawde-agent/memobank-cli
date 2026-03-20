import { MemoryFile, MemoryScope, Status } from '../types';
/** Personal tier: ~/.memobank/<project-name>/ */
export declare function getGlobalDir(projectName: string): string;
/** Project/team tier: the repo root itself (.memobank/ in repo) */
export declare function getProjectDir(repoRoot: string): string;
/** Workspace tier (cross-repo): ~/.memobank/_workspace/<name>/ */
export declare function getWorkspaceDir(workspaceName: string): string;
export declare function findRepoRoot(cwd: string, repoFlag?: string): string;
/**
 * Load memories from all configured tiers.
 * Priority: project > personal > workspace (for deduplication by filename).
 * globalDir and workspaceDir are optional; if absent, those tiers are skipped silently.
 */
export declare function loadAll(repoRoot: string, scope?: MemoryScope | 'all', globalDir?: string, workspaceDir?: string): MemoryFile[];
export declare function loadFile(filePath: string): MemoryFile;
export declare function writeMemory(repoRoot: string, memory: Omit<MemoryFile, 'path' | 'scope'>): string;
/** Patch status in a memory file's frontmatter in-place */
export declare function updateMemoryStatus(filePath: string, status: Status): void;
export declare function writeMemoryMd(repoRoot: string, results: Array<{
    memory: MemoryFile;
    score: number;
}>, query: string, engine: string): void;
export declare function readMemoryMd(repoRoot: string): string | null;
//# sourceMappingURL=store.d.ts.map