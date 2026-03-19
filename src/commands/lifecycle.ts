/**
 * Lifecycle command
 * Analyze and manage memory lifecycle (tiers, archival, corrections)
 */

import { findRepoRoot } from '../core/store';
import {
  analyzeLifecycle,
  generateLifecycleReport,
  archiveMemory,
  deleteMemory,
  getFlaggedMemories,
  recordCorrection,
  LifecycleConfig,
} from '../core/lifecycle-manager';

export interface LifecycleOptions {
  repo?: string;
  report?: boolean;
  archive?: boolean;
  delete?: boolean;
  flagged?: boolean;
  tier?: 'core' | 'working' | 'peripheral';
}

const DEFAULT_CONFIG: LifecycleConfig = {
  coreThreshold: 10,
  peripheralThreshold: 90,
  archiveAfterDays: 180,
  deleteAfterDays: 365,
  allowCorrections: true,
  correctionThreshold: 3,
};

export async function lifecycleCommand(options: LifecycleOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);

  // Generate report
  if (options.report || !options.archive && !options.delete && !options.flagged && !options.tier) {
    const report = generateLifecycleReport(repoRoot, DEFAULT_CONFIG);
    console.log(report);
    return;
  }

  // Show flagged memories
  if (options.flagged) {
    const flagged = getFlaggedMemories(repoRoot);
    if (flagged.length === 0) {
      console.log('✓ No memories flagged for review');
    } else {
      console.log(`\n🚩 Flagged Memories (${flagged.length})\n`);
      console.log('These memories have been corrected multiple times:\n');
      for (const memory of flagged) {
        console.log(`- [${memory.type}] ${memory.name}`);
        console.log(`  ${memory.description}`);
        console.log(`  Path: ${memory.path}\n`);
      }
    }
    return;
  }

  // Analyze and show by tier
  if (options.tier) {
    const analysis = analyzeLifecycle(repoRoot, DEFAULT_CONFIG);
    const filtered = analysis.filter((a) => a.tier === options.tier);

    if (filtered.length === 0) {
      console.log(`No memories in tier: ${options.tier}`);
    } else {
      console.log(`\n📊 ${options.tier.toUpperCase()} Tier Memories (${filtered.length})\n`);
      for (const item of filtered.slice(0, 20)) {
        console.log(`- [${item.memory.type}] ${item.memory.name}`);
        console.log(`  Access count: ${item.accessCount}`);
        console.log(`  Days since access: ${item.daysSinceAccess?.toFixed(0) || 'N/A'}\n`);
      }
      if (filtered.length > 20) {
        console.log(`... and ${filtered.length - 20} more\n`);
      }
    }
    return;
  }

  // Archive inactive memories
  if (options.archive) {
    const analysis = analyzeLifecycle(repoRoot, DEFAULT_CONFIG);
    const archivalCandidates = analysis.filter((a) => a.isArchivalCandidate);

    if (archivalCandidates.length === 0) {
      console.log('✓ No memories need archival');
      return;
    }

    console.log(`\n📦 Archival Candidates (${archivalCandidates.length})\n`);
    for (const item of archivalCandidates) {
      console.log(`- [${item.memory.type}] ${item.memory.name}`);
      console.log(`  Days inactive: ${item.daysSinceAccess?.toFixed(0)}\n`);
    }

    console.log('\n⚠️  To archive a specific memory, use:');
    console.log(`   memo lifecycle archive --path <memory-path>\n`);
    return;
  }

  // Delete memories
  if (options.delete) {
    console.log('\n⚠️  Delete operation requires --path option\n');
    console.log('Usage: memo lifecycle delete --path <memory-path>\n');
    return;
  }
}

/**
 * Record a correction for a memory
 */
export async function correctCommand(
  memoryPath: string,
  options: { repo?: string; reason?: string }
): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);

  // For now, just record the correction request
  // Full implementation would open editor for correction
  const record = recordCorrection(
    repoRoot,
    memoryPath,
    '[original content]',
    '[corrected content]',
    options.reason || 'User correction'
  );

  if (record.flaggedForReview) {
    console.log('⚠️  This memory has been corrected multiple times and is flagged for review');
  } else {
    console.log('✓ Correction recorded');
  }

  console.log(`Total corrections: ${record.corrections.length}`);
}
