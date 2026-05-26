import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { readJsonFile } from './fs-utils';
import { resolveProjectId } from './dir-resolver';
import { loadFile } from './memory-loader';
import { writeMemory } from './store';
import { deduplicate } from './dedup';
import type { DedupBatchLLM } from './dedup';
import { incrementalEdgeUpdate } from '../engines/memory-graph';
import type { PendingEntry, PendingCandidate } from './store';
import type { MemoryFile } from '../types';

export async function processQueue(memoBankDir: string, llm?: DedupBatchLLM): Promise<void> {
  const pendingDir = path.join(memoBankDir, '.pending');
  if (!fs.existsSync(pendingDir)) {
    return;
  }

  const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    return;
  }

  const currentProjectId = resolveProjectId(memoBankDir);

  // Load all existing memories for dedup
  const existing: MemoryFile[] = [];
  for (const type of ['lesson', 'decision', 'workflow', 'architecture']) {
    const typeDir = path.join(memoBankDir, type);
    if (!fs.existsSync(typeDir)) {
      continue;
    }
    for (const file of fs.readdirSync(typeDir).filter((f) => f.endsWith('.md'))) {
      try {
        existing.push(loadFile(path.join(typeDir, file)));
      } catch {
        /* skip unreadable */
      }
    }
  }

  for (const file of files) {
    const filePath = path.join(pendingDir, file);

    const entry = readJsonFile<PendingEntry | null>(filePath, null);
    if (!entry) {
      console.warn(`Skipping corrupt pending file: ${file}`);
      fs.unlinkSync(filePath);
      continue;
    }

    if (entry.projectId !== currentProjectId) {
      console.warn(`Deleted cross-project entry: ${entry.projectId} !== ${currentProjectId}`);
      fs.unlinkSync(filePath);
      continue;
    }

    // Wrap DedupBatchLLM → DedupLLM (binary DUPLICATE/KEEP_BOTH)
    type Pair = { candidate: PendingCandidate; existing: MemoryFile };
    const simpleLlm = llm
      ? async (pairs: Pair[]): Promise<Array<'DUPLICATE' | 'KEEP_BOTH'>> => {
          const decisions = await llm(pairs);
          return decisions.map((d) => (d.action === 'skip' ? 'DUPLICATE' : 'KEEP_BOTH'));
        }
      : undefined;
    const { toWrite } = await deduplicate(entry.candidates, existing, simpleLlm);
    for (const candidate of toWrite) {
      const created = new Date().toISOString();
      // `created` is not in PendingCandidate — injected at write time
      const writtenPath = writeMemory(memoBankDir, {
        ...candidate,
        created,
        project: entry.projectId,
      });
      // Add to existing so subsequent pending files see newly written memories
      existing.push({ ...candidate, path: '', created, status: 'experimental' });

      // Graph edge update — non-fatal, only when code-index.db exists
      const dbPath = path.join(memoBankDir, 'meta', 'code-index.db');
      if (fs.existsSync(dbPath)) {
        const fileContent = fs.readFileSync(writtenPath, 'utf-8');
        const memInput = {
          id: candidate.name,
          file_path: writtenPath,
          content: (candidate as { content?: string }).content ?? '',
          type: candidate.type,
          tags: candidate.tags,
          status: (candidate as { status?: string }).status ?? 'experimental',
          content_hash: crypto.createHash('sha256').update(fileContent, 'utf-8').digest('hex'),
          updated_at: created,
        };
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const Database = require('better-sqlite3');
          const db = new Database(dbPath) as { close(): void };
          try {
            await incrementalEdgeUpdate(db, memInput);
          } finally {
            db.close();
          }
        } catch (err) {
          console.warn('graph edge update failed:', (err as Error).message);
        }
      }
    }

    fs.unlinkSync(filePath);
  }
}
