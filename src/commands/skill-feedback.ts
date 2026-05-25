import * as fs from 'fs';
import * as path from 'path';
import { loadAll } from '../core/memory-loader';
import { loadAccessLogs } from '../core/lifecycle-manager';

interface RecallMiss {
  query: string;
  timestamp: string;
  result_count: number;
}

export async function skillFeedbackCommand(repoRoot: string): Promise<void> {
  // 1. Recall misses
  const missesPath = path.join(repoRoot, 'meta', 'recall-misses.json');
  let misses: RecallMiss[] = [];
  try {
    if (fs.existsSync(missesPath)) {
      misses = JSON.parse(fs.readFileSync(missesPath, 'utf-8'));
    }
  } catch {
    misses = [];
  }

  // 2. Never-recalled memories (access_count = 0 or absent from access log)
  // loadAll with no scope argument searches all tiers (project + personal + workspace)
  const memories = loadAll(repoRoot);
  const logs = loadAccessLogs(repoRoot);
  const neverRecalled = memories.filter((m) => {
    const log = logs[m.path];
    return !log || log.accessCount === 0;
  });

  // 3. Isolated memory nodes (no edges) — requires code-index.db
  let isolatedCount = 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CodeIndex } = require('../engines/code-index') as {
      CodeIndex: { getDbPath(r: string): string; isAvailable(): boolean };
    };
    if (CodeIndex.isAvailable()) {
      const dbPath = CodeIndex.getDbPath(repoRoot);
      if (fs.existsSync(dbPath)) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require('better-sqlite3');
        const db = new Database(dbPath);
        try {
          const rows = db
            .prepare(
              `SELECT COUNT(*) AS n FROM memory_nodes mn
               LEFT JOIN memory_edges me_in  ON mn.id = me_in.target_id
               LEFT JOIN memory_edges me_out ON mn.id = me_out.source_id AND me_out.source_type = 'memory'
               WHERE me_in.target_id IS NULL AND me_out.source_id IS NULL`
            )
            .get() as { n: number };
          isolatedCount = rows.n;
        } finally {
          db.close();
        }
      }
    }
  } catch {
    // better-sqlite3 absent — skip
  }

  // Output report
  process.stdout.write('## Skill Feedback Report\n\n');
  process.stdout.write(`**Recall misses (0 results):** ${misses.length}\n`);
  if (misses.length > 0) {
    process.stdout.write('Recent missed queries:\n');
    for (const m of misses.slice(-5)) {
      process.stdout.write(`  - "${m.query}" (${m.timestamp.slice(0, 10)})\n`);
    }
  }
  process.stdout.write(`\n**Never-recalled memories:** ${neverRecalled.length}\n`);
  if (neverRecalled.length > 0) {
    for (const m of neverRecalled.slice(0, 10)) {
      process.stdout.write(`  - ${m.name} (${m.type})\n`);
    }
    if (neverRecalled.length > 10) {
      process.stdout.write(`  ... and ${neverRecalled.length - 10} more\n`);
    }
  }
  if (isolatedCount > 0) {
    process.stdout.write(`\n**Isolated memory nodes (no graph edges):** ${isolatedCount}\n`);
    process.stdout.write('  Run: memo index-code to rebuild edges\n');
  }

  const hasFeedback = misses.length > 0 || neverRecalled.length > 0 || isolatedCount > 0;
  if (!hasFeedback) {
    process.stdout.write('\n✓ No skill feedback issues found.\n');
  } else {
    process.stdout.write('\nConsider updating SKILL.md trigger words for missed queries.\n');
  }
}
