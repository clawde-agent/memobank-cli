import type { MemoryFile, MemoryType, Confidence, MemoryScope, Status } from '../types';
/** Personal tier: ~/.memobank/<project-name>/ */
export declare function getGlobalDir(projectName: string): string;
/** Project/team tier: the repo root itself (.memobank/ in repo) */
export declare function getProjectDir(repoRoot: string): string;
/** Workspace tier (cross-repo): ~/.memobank/_workspace/<name>/ */
export declare function getWorkspaceDir(workspaceName: string): string;
export declare function findRepoRoot(cwd: string, repoFlag?: string): string;
/** Find the git repo root (the dir containing .git), or return cwd. */
export declare function findGitRoot(cwd: string): string;
/**
 * Resolve a stable project identifier for the current repo.
 * Priority: git remote origin → config.project.name → parent directory name.
 * memoBankDir is the .memobank/ directory (e.g. /repo/.memobank).
 */
export declare function resolveProjectId(memoBankDir: string): string;
export interface PendingCandidate {
    name: string;
    type: MemoryType;
    description: string;
    tags: string[];
    confidence: Confidence;
    content: string;
}
export interface PendingEntry {
    id: string;
    timestamp: string;
    projectId: string;
    candidates: PendingCandidate[];
}
export declare function writePending(memoBankDir: string, entry: PendingEntry): void;
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