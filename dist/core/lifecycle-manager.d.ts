/**
 * Memory Lifecycle Manager
 * Handles memory promotion, demotion, archival, and correction
 * Ported and adapted from memory-lancedb-pro
 */
import type { MemoryFile } from '../types';
/**
 * Memory tiers based on usage and importance
 */
export type MemoryTier = 'core' | 'working' | 'peripheral';
/**
 * Access log for tracking memory usage
 */
export interface AccessLog {
    memoryPath: string;
    lastAccessed: Date;
    accessCount: number;
    recallQueries: string[];
    epochAccessCount: number;
    team_epoch: string;
}
/**
 * Tier-based archival configuration (distinct from status-transition LifecycleConfig in types.ts)
 */
export interface TierConfig {
    coreThreshold: number;
    peripheralThreshold: number;
    archiveAfterDays: number;
    deleteAfterDays: number;
    allowCorrections: boolean;
    correctionThreshold: number;
}
/**
 * Load access logs
 */
export declare function loadAccessLogs(repoRoot: string): Record<string, AccessLog>;
/**
 * Save access logs
 */
export declare function saveAccessLogs(repoRoot: string, logs: Record<string, AccessLog>): void;
/**
 * Record memory access with file locking to prevent race conditions
 */
export declare function recordAccess(repoRoot: string, memoryPath: string, query?: string): AccessLog;
/**
 * Get memory tier based on access patterns
 */
export declare function getMemoryTier(memory: MemoryFile, accessLog?: AccessLog, config?: TierConfig): MemoryTier;
/**
 * Analyze memory lifecycle for all memories
 */
export interface LifecycleAnalysis {
    memory: MemoryFile;
    tier: MemoryTier;
    accessCount: number;
    daysSinceAccess: number | null;
    isArchivalCandidate: boolean;
    isDeletionCandidate: boolean;
    suggestion?: string;
}
export declare function analyzeLifecycle(repoRoot: string, config?: TierConfig): LifecycleAnalysis[];
/**
 * Correction record for tracking memory corrections
 */
export interface CorrectionRecord {
    memoryPath: string;
    corrections: Array<{
        date: string;
        originalText: string;
        correctedText: string;
        reason: string;
    }>;
    flaggedForReview: boolean;
}
/**
 * Load corrections log
 */
export declare function loadCorrections(repoRoot: string): Record<string, CorrectionRecord>;
/**
 * Save corrections log
 */
export declare function saveCorrections(repoRoot: string, corrections: Record<string, CorrectionRecord>): void;
/**
 * Record a memory correction
 */
export declare function recordCorrection(repoRoot: string, memoryPath: string, originalText: string, correctedText: string, reason: string): CorrectionRecord;
/**
 * Get memories flagged for review
 */
export declare function getFlaggedMemories(repoRoot: string): MemoryFile[];
/**
 * Archive a memory (move to archive directory)
 */
export declare function archiveMemory(repoRoot: string, memoryPath: string): void;
/**
 * Delete a memory permanently
 */
export declare function deleteMemory(repoRoot: string, memoryPath: string): void;
/**
 * Update memory content (correction)
 */
export declare function updateMemory(repoRoot: string, memoryPath: string, updates: Partial<MemoryFile>): void;
/**
 * Generate lifecycle report
 */
export declare function generateLifecycleReport(repoRoot: string, config?: TierConfig): string;
/**
 * Called after a successful recall.
 * Increments epochAccessCount and applies status upgrades.
 */
export declare function updateStatusOnRecall(repoRoot: string, memoryPath: string): void;
/**
 * Full scan of all memories — applies downgrade rules.
 * Run periodically (manually or via CI).
 */
export declare function runLifecycleScan(repoRoot: string, globalDir?: string): void;
/**
 * Reset team_epoch to now and zero out epochAccessCount for all entries.
 */
export declare function resetEpoch(repoRoot: string): void;
//# sourceMappingURL=lifecycle-manager.d.ts.map