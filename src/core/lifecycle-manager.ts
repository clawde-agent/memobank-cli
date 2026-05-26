import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { readJsonFile, ensureDir } from './fs-utils';
import type { MemoryFile, Status } from '../types';
import { loadAll } from './memory-loader';
import { writeMemory, updateMemoryStatus } from './store';
import { loadConfig } from '../config';
import {
  classifyMemory,
  shouldPromote,
  shouldDemote,
  DEFAULT_TIER_CONFIG,
} from './lifecycle-engine';
import type { AccessLog, MemoryTier, TierConfig } from './lifecycle-engine';

export type { AccessLog, MemoryTier, TierConfig };

function getAccessLogPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'access-log.json');
}

function getAccessLogLockPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'access-log.lock');
}

function acquireLock(repoRoot: string, timeoutMs: number = 5000): boolean {
  const lockPath = getAccessLogLockPath(repoRoot);
  const lockDir = path.dirname(lockPath);

  ensureDir(lockDir);

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EEXIST') {
        try {
          const lockPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
          if (!Number.isNaN(lockPid)) {
            try {
              process.kill(lockPid, 0);
            } catch {
              fs.unlinkSync(lockPath);
              continue;
            }
          }
        } catch {
          try {
            fs.unlinkSync(lockPath);
          } catch {
            /* ignore */
          }
          continue;
        }
        const waitTime = Math.min(50, timeoutMs - (Date.now() - startTime));
        if (waitTime > 0) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitTime);
        }
      } else {
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

function releaseLock(repoRoot: string): void {
  const lockPath = getAccessLogLockPath(repoRoot);
  try {
    fs.unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

function getCorrectionsPath(repoRoot: string): string {
  return path.join(repoRoot, 'meta', 'corrections.json');
}

export function loadAccessLogs(repoRoot: string): Record<string, AccessLog> {
  const accessLogPath = getAccessLogPath(repoRoot);
  if (!fs.existsSync(accessLogPath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(accessLogPath, 'utf-8');
    const data = JSON.parse(content);
    for (const key of Object.keys(data)) {
      data[key].lastAccessed = new Date(data[key].lastAccessed);
    }
    return data;
  } catch (error) {
    console.warn(`Could not load access logs: ${(error as Error).message}`);
    return {};
  }
}

export function saveAccessLogs(repoRoot: string, logs: Record<string, AccessLog>): void {
  const accessLogPath = getAccessLogPath(repoRoot);
  ensureDir(path.dirname(accessLogPath));
  fs.writeFileSync(accessLogPath, JSON.stringify(logs, null, 2), 'utf-8');
}

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

export function getMemoryTier(
  _memory: MemoryFile,
  accessLog?: AccessLog,
  config: TierConfig = DEFAULT_TIER_CONFIG
): MemoryTier {
  return classifyMemory(accessLog, config.coreThreshold, config.peripheralThreshold);
}

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
  config: TierConfig = DEFAULT_TIER_CONFIG
): LifecycleAnalysis[] {
  const memories = loadAll(repoRoot);
  const accessLogs = loadAccessLogs(repoRoot);
  const now = Date.now();

  return memories.map((memory) => {
    const accessLog = accessLogs[memory.path];
    const tier = classifyMemory(accessLog, config.coreThreshold, config.peripheralThreshold);

    const daysSinceAccess = accessLog?.lastAccessed
      ? (now - accessLog.lastAccessed.getTime()) / 86400000
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

export function loadCorrections(repoRoot: string): Record<string, CorrectionRecord> {
  const correctionsPath = getCorrectionsPath(repoRoot);
  return readJsonFile<Record<string, CorrectionRecord>>(correctionsPath, {});
}

export function saveCorrections(
  repoRoot: string,
  corrections: Record<string, CorrectionRecord>
): void {
  const correctionsPath = getCorrectionsPath(repoRoot);
  ensureDir(path.dirname(correctionsPath));
  fs.writeFileSync(correctionsPath, JSON.stringify(corrections, null, 2), 'utf-8');
}

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
  if (record.corrections.length >= 3) {
    record.flaggedForReview = true;
  }
  saveCorrections(repoRoot, corrections);
  return record;
}

export function getFlaggedMemories(repoRoot: string): MemoryFile[] {
  const corrections = loadCorrections(repoRoot);
  const memories = loadAll(repoRoot);
  const flaggedPaths = new Set(
    Object.entries(corrections)
      .filter(([, record]) => record.flaggedForReview)
      .map(([p]) => p)
  );
  return memories.filter((m) => flaggedPaths.has(m.path));
}

export function archiveMemory(repoRoot: string, memoryPath: string): void {
  const archiveDir = path.join(repoRoot, 'archive');
  const memoryName = path.basename(memoryPath);
  const archivePath = path.join(archiveDir, memoryName);
  ensureDir(archiveDir);
  fs.renameSync(memoryPath, archivePath);
  console.log(`Archived: ${memoryName}`);
}

export function deleteMemory(_repoRoot: string, memoryPath: string): void {
  fs.unlinkSync(memoryPath);
  console.log(`Deleted: ${path.basename(memoryPath)}`);
}

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
  const updatedMemory = { ...memory, ...updates };
  writeMemory(repoRoot, {
    type: updatedMemory.type,
    name: updatedMemory.name,
    description: updatedMemory.description,
    tags: updatedMemory.tags,
    content: updatedMemory.content,
    confidence: updatedMemory.confidence,
    created: updatedMemory.created,
  });
  console.log(`Updated: ${path.basename(memoryPath)}`);
}

export function generateLifecycleReport(
  repoRoot: string,
  config: TierConfig = DEFAULT_TIER_CONFIG
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

export function updateStatusOnRecall(repoRoot: string, memoryPath: string): void {
  const lockAcquired = acquireLock(repoRoot);
  if (!lockAcquired) {
    console.warn('Could not acquire access log lock, status update may be inconsistent');
  }
  try {
    const logs = loadAccessLogs(repoRoot);
    const log = logs[memoryPath];
    if (!log) return;

    log.epochAccessCount = (log.epochAccessCount ?? 0) + 1;
    saveAccessLogs(repoRoot, logs);

    let currentStatus: Status = 'experimental';
    try {
      const content = fs.readFileSync(memoryPath, 'utf-8');
      const parsed = matter(content);
      currentStatus = parsed.data.status ?? 'experimental';
    } catch {
      return;
    }

    const config = loadConfig(repoRoot);
    const threshold = config.lifecycle?.review_recall_threshold ?? 3;
    const nextStatus = shouldPromote(currentStatus, log.epochAccessCount, threshold);
    if (nextStatus) {
      updateMemoryStatus(memoryPath, nextStatus);
    }
  } finally {
    if (lockAcquired) {
      releaseLock(repoRoot);
    }
  }
}

export function pruneOrphanedAccessLogs(repoRoot: string): void {
  const logs = loadAccessLogs(repoRoot);
  let changed = false;
  for (const memoryPath of Object.keys(logs)) {
    if (!fs.existsSync(memoryPath)) {
      delete logs[memoryPath];
      changed = true;
    }
  }
  if (changed) saveAccessLogs(repoRoot, logs);
}

export function pruneDeprecatedMemories(repoRoot: string): number {
  const memories = loadAll(repoRoot);
  let count = 0;
  for (const memory of memories) {
    if (memory.status === 'deprecated') {
      try {
        fs.unlinkSync(memory.path);
        count++;
      } catch {
        // non-fatal — file may already be gone
      }
    }
  }
  pruneOrphanedAccessLogs(repoRoot);
  return count;
}

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

    const nextStatus = shouldDemote(
      currentStatus,
      daysSinceAccess,
      daysSinceCreation,
      lc.active_to_review_days,
      lc.review_to_deprecated_days,
      lc.experimental_ttl_days
    );
    if (nextStatus) {
      updateMemoryStatus(memory.path, nextStatus);
    }
  }

  pruneOrphanedAccessLogs(repoRoot);
}

export function resetEpoch(repoRoot: string): void {
  const logs = loadAccessLogs(repoRoot);
  const newEpoch = new Date().toISOString();
  for (const key of Object.keys(logs)) {
    logs[key].epochAccessCount = 0;
    logs[key].team_epoch = newEpoch;
  }
  saveAccessLogs(repoRoot, logs);
}
