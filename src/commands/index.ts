/**
 * Index command
 * Build or update the search index
 */

import { loadAll, findRepoRoot } from '../core/store';
import { loadConfig } from '../config';
import { TextEngine } from '../engines/text-engine';

export interface IndexOptions {
  incremental?: boolean;
  engine?: string;
  force?: boolean;
  repo?: string;
}

export async function indexCommand(options: IndexOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const config = loadConfig(repoRoot);

  const engineName = options.engine ?? config.embedding.engine;

  // Text engine: no-op (searches live files directly)
  if (engineName === 'text') {
    const memories = loadAll(repoRoot);
    console.log(`text engine: no index needed`);
    console.log(`Loaded ${memories.length} memories from disk`);
    return;
  }

  // LanceDB engine
  if (engineName === 'lancedb') {
    try {
      const { LanceDbEngine } = await import('../engines/lancedb-engine');
      const engine = new LanceDbEngine();

      const memories = loadAll(repoRoot);
      console.log(`Indexing ${memories.length} memories...`);

      await engine.index(memories, options.incremental ?? false);

      console.log('Index updated successfully');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        console.error('LanceDB engine requires: npm install vectordb openai');
        console.error('Or use the default text engine (no setup needed).');
      } else {
        console.error(`Index error: ${(error as Error).message}`);
      }
    }
  }
}