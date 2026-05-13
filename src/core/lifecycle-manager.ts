/**
 * Memory Lifecycle Manager
 * Handles memory promotion, demotion, archival, and correction
 * Ported and adapted from memory-lancedb-pro
 */

import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type { MemoryFile, Confidence, Status } from '../types';
import { loadAll, writeMemory, updateMemoryStatus } from './store';
import { loadConfig } from '../config';

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
  recallQueries: string[]; // Recent queries that recalled this memory
  epochAccessCount: number; // recalls since current team_epoch
  team_epoch: string; // ISO timestamp of current epoch start
}

/**
 * Tier-based archival configuration (distinct from status-transition LifecycleConfig in types.ts)
 */
export interface TierConfig {
  coreThreshold: number; // Access count to become core
  peripheralThreshold: number; // Days without access to become peripheral
  archiveAfterDays: number; // Days without access before archival suggestion
  deleteAfterDays: number; // Days archived before deletion suggestion
  allowCorrections: boolean;
  correctionThreshold: number; // Number of corrections before flagging
}

const DEFAULT_CONFIG: TierConfig = {
  coreThreshold: 10,
  peripheralThreshold: 90,
  archiveAfterDays: 180,
  deleteAfterDays: 365,
  allowCorrections: true,
  correctionThreshold: 3,
};

/**
 * Access log file path
 */
function getAccessLogPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'access-log.json');
}

/**
 * Lock file path for access log
 */
function getAccessLogLockPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'access-log.lock');
}

/**
 * Acquire lock for access log operations
 * Uses file-based locking to prevent race conditions
 */
function acquireLock(repoRoot: string, timeoutMs: number = 5000): boolean {
  const lockPath = getAccessLogLockPath(repoRoot);
  const lockDir = path.dirname(lockPath);

  if (!fs.existsSync(lockDir)) {
    fs.mkdirSync(lockDir, { recursive: true });
  }

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      // Try to create lock file exclusively
      fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EEXIST') {
        // Lock exists, check if it's stale (process no longer running)
        try {
          const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
          if (!Number.isNaN(lockPid)) {
            try {
              // Check if process is still running
              process.kill(lockPid, 0);
            } catch {
              // Process is dead, remove stale lock
              fs.unlinkSync(lockPath);
              continue;
            }
          }
        } catch {
          // Can't read lock file, remove it
          try {
            fs.unlinkSync(lockPath);
          } catch {
            /* ignore */
          }
          continue;
        }
        // Wait and retry
        const waitTime = Math.min(50, timeoutMs - (Date.now() - startTime));
        if (waitTime > 0) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitTime);
        }
      } else {
        // Other error, try to remove and retry
        try {
          fs.unlinkSync(lockPath);
        } catch {
          /* ignore */
        }
      }
    }
  }
  return false;
}

/**
 * Release lock for access log operations
 */
function releaseLock(repoRoot: string): void {
  const lockPath = getAccessLogLockPath(repoRoot);
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // Ignore errors when releasing lock
  }
}

/**
 * Corrections log file path
 */
function getCorrectionsPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'corrections.json');
}

/**
 * Load access logs
 */
export function loadAccessLogs(repoRoot: string): Record<string, AccessLog> {
  const accessLogPath = getAccessLogPath(repoRoot);

  if (!fs.existsSync(accessLogPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(accessLogPath, 'utf-8');
    const data = JSON.parse(content);

    // Convert string dates back to Date objects
    for (const key of Object.keys(data)) {
      data[key].lastAccessed = new Date(data[key].lastAccessed);
    }

    return data;
  } catch (error) {
    console.warn(`Could not load access logs: ${(error as Error).message}`);
    return {};
  }
}

/**
 * Save access logs
 */
export function saveAccessLogs(repoRoot: string, logs: Record<string, AccessLog>): void {
  const accessLogPath = getAccessLogPath(repoRoot);
  const logDir = path.dirname(accessLogPath);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  fs.writeFileSync(accessLogPath, JSON.stringify(logs, null, 2), 'utf-8');
}

/**
 * Record memory access with file locking to prevent race conditions
 */
export function recordAccess(repoRoot: string, memoryPath: string, query?: string): AccessLog {
  const lockAcquired = acquireLock(repoRoot);
  if (!lockAcquired) {
    console.warn('Could not acquire access log lock, recording may be inconsistent');
  }

  try {
    const logs = loadAccessLogs(repoRoot);
    const now = new Date();

    if (!logs[memoryPath]) {
      logs[memoryPath] = {
        memoryPath,
        lastAccessed: now,
        accessCount: 0,
        recallQueries: [],
        epochAccessCount: 0,
        team_epoch: now.toISOString(),
      };
    }

    const log = logs[memoryPath];
    log.lastAccessed = now;
    log.accessCount++;

    if (query) {
      log.recallQueries.unshift(query);
      if (log.recallQueries.length > 10) {
        log.recallQueries.pop();
      }
    }

    saveAccessLogs(repoRoot, logs);
    return log;
  } finally {
    if (lockAcquired) {
      releaseLock(repoRoot);
    }
  }
}

/**
 * Get memory tier based on access patterns
 */
export function getMemoryTier(
  memory: MemoryFile,
  accessLog?: AccessLog,
  config: TierConfig = DEFAULT_CONFIG
): MemoryTier {
  const accessCount = accessLog?.accessCount || 0;

  // High access count → core
  if (accessCount >= config.coreThreshold) {
    return 'core';
  }

  // Check days since last access
  if (accessLog?.lastAccessed) {
    const daysSinceAccess = (Date.now() - accessLog.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

    // Long time without access → peripheral
    if (daysSinceAccess > config.peripheralThreshold) {
      return 'peripheral';
    }
  }

  // Default → working
  return 'working';
}

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

export function analyzeLifecycle(
  repoRoot: string,
  config: TierConfig = DEFAULT_CONFIG
): LifecycleAnalysis[] {
  const memories = loadAll(repoRoot);
  const accessLogs = loadAccessLogs(repoRoot);
  const now = Date.now();

  return memories.map((memory) => {
    const accessLog = accessLogs[memory.path];
    const tier = getMemoryTier(memory, accessLog, config);

    const daysSinceAccess = accessLog?.lastAccessed
      ? (now - accessLog.lastAccessed.getTime()) / (1000 * 60 * 60 * 24)
      : null;

    const isArchivalCandidate = (daysSinceAccess || 0) > config.archiveAfterDays;
    const isDeletionCandidate = isArchivalCandidate && tier === 'peripheral';

    let suggestion: string | undefined;
    if (tier === 'core') {
      suggestion = 'Keep - frequently accessed';
    } else if (tier === 'peripheral') {
      suggestion = 'Consider archiving or deleting';
    } else if (isArchivalCandidate) {
      suggestion = 'Consider archiving';
    }

    return {
      memory,
      tier,
      accessCount: accessLog?.accessCount || 0,
      daysSinceAccess,
      isArchivalCandidate,
      isDeletionCandidate,
      suggestion,
    };
  });
}

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
export function loadCorrections(repoRoot: string): Record<string, CorrectionRecord> {
  const correctionsPath = getCorrectionsPath(repoRoot);

  if (!fs.existsSync(correctionsPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(correctionsPath, 'utf-8'));
  } catch (error) {
    console.warn(`Could not load corrections: ${(error as Error).message}`);
    return {};
  }
}

/**
 * Save corrections log
 */
export function saveCorrections(
  repoRoot: string,
  corrections: Record<string, CorrectionRecord>
): void {
  const correctionsPath = getCorrectionsPath(repoRoot);
  const logDir = path.dirname(correctionsPath);

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  fs.writeFileSync(correctionsPath, JSON.stringify(corrections, null, 2), 'utf-8');
}

/**
 * Record a memory correction
 */
export function recordCorrection(
  repoRoot: string,
  memoryPath: string,
  originalText: string,
  correctedText: string,
  reason: string
): CorrectionRecord {
  const corrections = loadCorrections(repoRoot);

  if (!corrections[memoryPath]) {
    corrections[memoryPath] = {
      memoryPath,
      corrections: [],
      flaggedForReview: false,
    };
  }

  const record = corrections[memoryPath];
  record.corrections.push({
    date: new Date().toISOString(),
    originalText,
    correctedText,
    reason,
  });

  // Flag for review if too many corrections
  if (record.corrections.length >= 3) {
    record.flaggedForReview = true;
  }

  saveCorrections(repoRoot, corrections);
  return record;
}

/**
 * Get memories flagged for review
 */
export function getFlaggedMemories(repoRoot: string): MemoryFile[] {
  const corrections = loadCorrections(repoRoot);
  const memories = loadAll(repoRoot);

  const flaggedPaths = new Set(
    Object.entries(corrections)
      .filter(([, record]) => record.flaggedForReview)
      .map(([path]) => path)
  );

  return memories.filter((m) => flaggedPaths.has(m.path));
}

/**
 * Archive a memory (move to archive directory)
 */
export function archiveMemory(repoRoot: string, memoryPath: string): void {
  const archiveDir = path.join(repoRoot, 'archive');
  const memoryName = path.basename(memoryPath);
  const archivePath = path.join(archiveDir, memoryName);

  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  fs.renameSync(memoryPath, archivePath);
  console.log(`Archived: ${memoryName}`);
}

/**
 * Delete a memory permanently
 */
export function deleteMemory(repoRoot: string, memoryPath: string): void {
  fs.unlinkSync(memoryPath);
  console.log(`Deleted: ${path.basename(memoryPath)}`);
}

/**
 * Update memory content (correction)
 */
export function updateMemory(
  repoRoot: string,
  memoryPath: string,
  updates: Partial<MemoryFile>
): void {
  const memories = loadAll(repoRoot);
  const memory = memories.find((m) => m.path === memoryPath);

  if (!memory) {
    throw new Error(`Memory not found: ${memoryPath}`);
  }

  // Apply updates
  const updatedMemory = { ...memory, ...updates };

  // Write updated memory
  writeMemory(repoRoot, {
    type: updatedMemory.type,
    name: updatedMemory.name,
    description: updatedMemory.description,
    tags: updatedMemory.tags,
    content: updatedMemory.content,
    confidence: updatedMemory.confidence as Confidence,
    created: updatedMemory.created,
  });

  console.log(`Updated: ${path.basename(memoryPath)}`);
}

/**
 * Generate lifecycle report
 */
export function generateLifecycleReport(
  repoRoot: string,
  config: TierConfig = DEFAULT_CONFIG
): string {
  const analysis = analyzeLifecycle(repoRoot, config);

  const core = analysis.filter((a) => a.tier === 'core');
  const working = analysis.filter((a) => a.tier === 'working');
  const peripheral = analysis.filter((a) => a.tier === 'peripheral');
  const archival = analysis.filter((a) => a.isArchivalCandidate);

  let report = '## Memory Lifecycle Report\n\n';
  report += `**Total Memories:** ${analysis.length}\n\n`;
  report += `### Tier Distribution\n`;
  report += `- Core (frequently accessed): ${core.length}\n`;
  report += `- Working (active): ${working.length}\n`;
  report += `- Peripheral (inactive): ${peripheral.length}\n\n`;

  if (archival.length > 0) {
    report += `### Archival Candidates (${archival.length})\n`;
    for (const item of archival.slice(0, 10)) {
      report += `- ${item.memory.name} (${item.daysSinceAccess?.toFixed(0)} days inactive)\n`;
    }
    if (archival.length > 10) {
      report += `... and ${archival.length - 10} more\n`;
    }
    report += '\n';
  }

  const flagged = getFlaggedMemories(repoRoot);
  if (flagged.length > 0) {
    report += `### Flagged for Review (${flagged.length})\n`;
    report += 'These memories have been corrected multiple times:\n';
    for (const memory of flagged) {
      report += `- ${memory.name}\n`;
    }
    report += '\n';
  }

  return report;
}

/**
 * Called after a successful recall.
 * Increments epochAccessCount and applies status upgrades.
 */
export function updateStatusOnRecall(repoRoot: string, memoryPath: string): void {
  const lockAcquired = acquireLock(repoRoot);
  if (!lockAcquired) {
    console.warn('Could not acquire access log lock, status update may be inconsistent');
  }

  try {
    const logs = loadAccessLogs(repoRoot);
    const log = logs[memoryPath];
    if (!log) {
      return;
    }

    // Increment epoch count
    log.epochAccessCount = (log.epochAccessCount ?? 0) + 1;
    saveAccessLogs(repoRoot, logs);

    // Read current status
    let currentStatus: Status = 'experimental';
    try {
      const content = fs.readFileSync(memoryPath, 'utf-8');
      const parsed = matter(content);
      currentStatus = parsed.data.status ?? 'experimental';
    } catch {
      return;
    }

    // Apply upgrade rules
    const config = loadConfig(repoRoot);
    const threshold = config.lifecycle?.review_recall_threshold ?? 3;

    if (currentStatus === 'experimental') {
      updateMemoryStatus(memoryPath, 'active');
    } else if (currentStatus === 'needs-review' && log.epochAccessCount >= threshold) {
      updateMemoryStatus(memoryPath, 'active');
    } else if (currentStatus === 'deprecated') {
      updateMemoryStatus(memoryPath, 'needs-review');
    }
  } finally {
    if (lockAcquired) {
      releaseLock(repoRoot);
    }
  }
}

/**
 * Full scan of all memories — applies downgrade rules.
 * Run periodically (manually or via CI).
 */
export function runLifecycleScan(repoRoot: string, globalDir?: string): void {
  const config = loadConfig(repoRoot);
  const lc = config.lifecycle!;
  const logs = loadAccessLogs(repoRoot);
  const memories = loadAll(repoRoot, 'all', globalDir);
  const now = Date.now();

  for (const memory of memories) {
    const log = logs[memory.path];
    const lastAccessed = log?.lastAccessed ? new Date(log.lastAccessed).getTime() : null;
    const daysSinceAccess = lastAccessed ? (now - lastAccessed) / 86400000 : Infinity;
    const currentStatus: Status = memory.status ?? 'experimental';
    const created = new Date(memory.created).getTime();
    const daysSinceCreation = (now - created) / 86400000;

    if (currentStatus === 'active' && daysSinceAccess > lc.active_to_review_days) {
      updateMemoryStatus(memory.path, 'needs-review');
    } else if (currentStatus === 'needs-review' && daysSinceAccess > lc.review_to_deprecated_days) {
      updateMemoryStatus(memory.path, 'deprecated');
    } else if (currentStatus === 'experimental' && daysSinceCreation > lc.experimental_ttl_days) {
      updateMemoryStatus(memory.path, 'deprecated');
    }
  }
}

/**
 * Reset team_epoch to now and zero out epochAccessCount for all entries.
 */
export function resetEpoch(repoRoot: string): void {
  const logs = loadAccessLogs(repoRoot);
  const newEpoch = new Date().toISOString();
  for (const key of Object.keys(logs)) {
    logs[key].epochAccessCount = 0;
    logs[key].team_epoch = newEpoch;
  }
  saveAccessLogs(repoRoot, logs);
}
