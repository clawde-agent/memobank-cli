import * as fs from 'fs';
import * as path from 'path';
import { loadFile, writeMemory, resolveProjectId } from './store';
import { deduplicate } from './dedup';
import type { PendingEntry } from './store';
import type { MemoryFile } from '../types';

export async function processQueue(memoBankDir: string): Promise<void> {
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

    let entry: PendingEntry;
    try {
      entry = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as PendingEntry;
    } catch {
      console.warn(`Skipping corrupt pending file: ${file}`);
      fs.unlinkSync(filePath);
      continue;
    }

    if (entry.projectId !== currentProjectId) {
      console.warn(`Deleted cross-project entry: ${entry.projectId} !== ${currentProjectId}`);
      fs.unlinkSync(filePath);
      continue;
    }

    const { toWrite } = await deduplicate(entry.candidates, existing);
    for (const candidate of toWrite) {
      const created = new Date().toISOString();
      // `created` is not in PendingCandidate — injected at write time
      writeMemory(memoBankDir, {
        ...candidate,
        created,
        project: entry.projectId,
      });
      // Add to existing so subsequent pending files see newly written memories
      existing.push({ ...candidate, path: '', created, status: 'experimental' });
    }

    fs.unlinkSync(filePath);
  }
}
