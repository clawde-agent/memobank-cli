/**
 * Migration from legacy personal/ + team/ layout to three-tier model.
 * personal/ → globalDir (personal/global tier)
 * team/     → repoRoot flat (project tier)
 */
export interface MigrateOptions {
    dryRun?: boolean;
    rollback?: boolean;
}
export interface MigrateResult {
    personalMoves: Array<{
        from: string;
        to: string;
    }>;
    teamMoves: Array<{
        from: string;
        to: string;
    }>;
    conflicts: string[];
}
export declare function migrate(repoRoot: string, globalDir: string, options: MigrateOptions): MigrateResult;
//# sourceMappingURL=migrate.d.ts.map