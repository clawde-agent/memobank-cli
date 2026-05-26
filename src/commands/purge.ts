/**
 * Purge command
 * Bulk-delete memory files matching filter criteria.
 *
 * Usage examples:
 *   memo purge --before 2026-05-27 --dry-run          # preview eval contamination
 *   memo purge --before 2026-05-27 --yes              # delete
 *   memo purge --project org/repo --type workflow --dry-run
 *   memo purge --status deprecated --yes
 */

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from '../core/dir-resolver';
import { loadAll } from '../core/memory-loader';
import type { MemoryFile, MemoryType } from '../types';

export interface PurgeOptions {
  before?: string;
  after?: string;
  project?: string;
  type?: string;
  status?: string;
  tag?: string;
  namePattern?: string;
  dryRun?: boolean;
  yes?: boolean;
  repo?: string;
}

export function applyPurgeFilters(memories: MemoryFile[], options: PurgeOptions): MemoryFile[] {
  let candidates = memories;

  if (options.before) {
    const cutoff = new Date(options.before).getTime();
    if (Number.isNaN(cutoff)) throw new Error(`Invalid date: ${options.before}`);
    candidates = candidates.filter((m) => new Date(m.created).getTime() < cutoff);
  }

  if (options.after) {
    const cutoff = new Date(options.after).getTime();
    if (Number.isNaN(cutoff)) throw new Error(`Invalid date: ${options.after}`);
    candidates = candidates.filter((m) => new Date(m.created).getTime() > cutoff);
  }

  if (options.project !== undefined) {
    candidates = candidates.filter((m) => m.project === options.project);
  }

  if (options.type) {
    const validTypes: MemoryType[] = ['lesson', 'decision', 'workflow', 'architecture'];
    if (!validTypes.includes(options.type as MemoryType)) {
      throw new Error(`Invalid type "${options.type}". Must be one of: ${validTypes.join(', ')}`);
    }
    candidates = candidates.filter((m) => m.type === options.type);
  }

  if (options.status) {
    candidates = candidates.filter((m) => m.status === options.status);
  }

  if (options.tag) {
    const tag = options.tag;
    candidates = candidates.filter((m) => m.tags.includes(tag));
  }

  if (options.namePattern) {
    let re: RegExp;
    try {
      re = new RegExp(options.namePattern, 'i');
    } catch {
      throw new Error(`Invalid regex pattern: ${options.namePattern}`);
    }
    candidates = candidates.filter((m) => re.test(m.name));
  }

  return candidates;
}

function printCandidateSummary(candidates: MemoryFile[], repoRoot: string): void {
  const byType: Record<string, MemoryFile[]> = {};
  for (const m of candidates) {
    byType[m.type] = byType[m.type] ?? [];
    byType[m.type].push(m);
  }

  for (const [type, mems] of Object.entries(byType).sort()) {
    console.log(`  ${type} (${mems.length})`);
    for (const m of mems.slice(0, 5)) {
      const relPath = path.relative(repoRoot, m.path);
      console.log(`    - ${m.name}  (${relPath})`);
    }
    if (mems.length > 5) {
      console.log(`    ... and ${mems.length - 5} more`);
    }
  }
}

export function purgeCommand(options: PurgeOptions): void {
  const hasFilter =
    options.before ??
    options.after ??
    options.project ??
    options.type ??
    options.status ??
    options.tag ??
    options.namePattern;

  if (!hasFilter) {
    console.error(
      'Error: at least one filter is required.\n' +
        '  --before <date>        created before ISO date\n' +
        '  --after <date>         created after ISO date\n' +
        '  --project <id>         matches frontmatter project field\n' +
        '  --type <type>          lesson|decision|workflow|architecture\n' +
        '  --status <status>      experimental|active|needs-review|deprecated\n' +
        '  --tag <tag>            has this tag\n' +
        '  --name-pattern <regex> name matches regex'
    );
    process.exit(1);
  }

  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const memories = loadAll(repoRoot, 'project');

  let candidates: MemoryFile[];
  try {
    candidates = applyPurgeFilters(memories, options);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
    return;
  }

  if (candidates.length === 0) {
    console.log('✓ No memories match the filter criteria.');
    return;
  }

  const prefix = options.dryRun ? '[dry-run] ' : '';
  const noun = candidates.length === 1 ? 'memory' : 'memories';
  console.log(`\n${prefix}${candidates.length} ${noun} would be deleted:\n`);
  printCandidateSummary(candidates, repoRoot);

  if (options.dryRun) {
    console.log(`\n→ Remove --dry-run and add --yes to execute (${candidates.length} ${noun}).`);
    return;
  }

  if (!options.yes) {
    console.log(
      `\n⚠️  Add --yes to confirm deletion of ${candidates.length} ${noun}.\n` +
        '    Run with --dry-run first to preview. This action is irreversible.'
    );
    return;
  }

  let deleted = 0;
  const failures: string[] = [];
  for (const m of candidates) {
    try {
      fs.unlinkSync(m.path);
      deleted++;
    } catch (err) {
      failures.push(`${path.relative(repoRoot, m.path)}: ${(err as Error).message}`);
    }
  }

  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }

  console.log(
    `\n✓ Deleted ${deleted} ${deleted === 1 ? 'memory' : 'memories'}.` +
      (failures.length > 0 ? ` (${failures.length} failed)` : '')
  );
}
