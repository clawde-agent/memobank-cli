import type { Status } from '../types';

export type MemoryTier = 'core' | 'working' | 'peripheral';

export interface AccessLog {
  memoryPath: string;
  lastAccessed: Date;
  accessCount: number;
  recallQueries: string[];
  epochAccessCount: number;
  team_epoch: string;
  last_study_suggested?: string;
}

export interface TierConfig {
  coreThreshold: number;
  peripheralThreshold: number;
  archiveAfterDays: number;
  deleteAfterDays: number;
  allowCorrections: boolean;
  correctionThreshold: number;
}

export const DEFAULT_TIER_CONFIG: TierConfig = {
  coreThreshold: 10,
  peripheralThreshold: 90,
  archiveAfterDays: 180,
  deleteAfterDays: 365,
  allowCorrections: true,
  correctionThreshold: 3,
};

export function classifyMemory(
  accessLog: AccessLog | undefined,
  coreThreshold: number,
  peripheralThreshold: number
): MemoryTier {
  const accessCount = accessLog?.accessCount ?? 0;
  if (accessCount >= coreThreshold) return 'core';
  if (accessLog?.lastAccessed) {
    const daysSinceAccess = (Date.now() - new Date(accessLog.lastAccessed).getTime()) / 86400000;
    if (daysSinceAccess > peripheralThreshold) return 'peripheral';
  }
  return 'working';
}

export function shouldPromote(
  currentStatus: Status,
  epochAccessCount: number,
  threshold: number
): Status | null {
  if (currentStatus === 'experimental') return 'active';
  if (currentStatus === 'needs-review' && epochAccessCount >= threshold) return 'active';
  if (currentStatus === 'deprecated') return 'needs-review';
  return null;
}

export function shouldDemote(
  currentStatus: Status,
  daysSinceAccess: number,
  daysSinceCreation: number,
  activeToReviewDays: number,
  reviewToDeprecatedDays: number,
  experimentalTtlDays: number
): Status | null {
  if (currentStatus === 'active' && daysSinceAccess > activeToReviewDays) {
    return 'needs-review';
  }
  if (currentStatus === 'needs-review' && daysSinceAccess > reviewToDeprecatedDays) {
    return 'deprecated';
  }
  if (currentStatus === 'experimental' && daysSinceCreation > experimentalTtlDays) {
    return 'deprecated';
  }
  return null;
}
