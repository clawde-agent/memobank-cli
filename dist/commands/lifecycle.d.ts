/**
 * Lifecycle command
 * Analyze and manage memory lifecycle (tiers, archival, corrections)
 */
export interface LifecycleOptions {
    repo?: string;
    report?: boolean;
    archive?: boolean;
    delete?: boolean;
    flagged?: boolean;
    tier?: 'core' | 'working' | 'peripheral';
    resetEpoch?: boolean;
    scan?: boolean;
}
export declare function lifecycleCommand(options?: LifecycleOptions): void;
/**
 * Record a correction for a memory
 */
export declare function correctCommand(memoryPath: string, options: {
    repo?: string;
    reason?: string;
}): void;
//# sourceMappingURL=lifecycle.d.ts.map