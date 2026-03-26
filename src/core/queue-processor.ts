import * as fs from 'fs';
import * as path from 'path';
import { loadFile, writeMemory, resolveProjectId } from './store';
import type { PendingEntry } from './store';

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

  // Load existing memory names for deduplication
  const existingNames = new Set<string>();
  for (const type of ['lesson', 'decision', 'workflow', 'architecture']) {
    const typeDir = path.join(memoBankDir, type);
    if (!fs.existsSync(typeDir)) {
      continue;
    }
    for (const file of fs.readdirSync(typeDir).filter((f) => f.endsWith('.md'))) {
      try {
        const memory = loadFile(path.join(typeDir, file));
        existingNames.add(memory.name);
      } catch {
        /* skip unreadable files */
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

    for (const candidate of entry.candidates) {
      if (existingNames.has(candidate.name)) {
        continue;
      }
      writeMemory(memoBankDir, {
        ...candidate,
        created: new Date().toISOString(),
        project: entry.projectId,
      });
      existingNames.add(candidate.name);
    }

    fs.unlinkSync(filePath);
  }
}
