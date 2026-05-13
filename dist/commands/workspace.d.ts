/**
 * Workspace memory commands (cross-repo, optional)
 * memo workspace init <remote>  — clone/init workspace repo
 * memo workspace sync           — pull latest; optionally push
 * memo workspace publish <file> — scan secrets + copy to workspace
 * memo workspace status         — show git status of local workspace clone
 */
export declare function workspaceInit(remoteUrl: string, repoRoot: string): void;
export declare function workspaceSync(repoRoot: string, push?: boolean): void;
export declare function workspacePublish(filePath: string, repoRoot: string, wsDirOverride?: string): Promise<void>;
export declare function workspaceStatus(repoRoot: string): void;
//# sourceMappingURL=workspace.d.ts.map