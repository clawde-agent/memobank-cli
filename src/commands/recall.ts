/**
 * Recall command
 * Hot path - called by memobank-skill before every session
 */

import { recall as runRecall, writeRecallResults } from '../core/retriever';
import { loadConfig } from '../config';
import { findRepoRoot } from '../core/store';
import { TextEngine } from '../engines/text-engine';
import { RecallResult } from '../types';

export interface RecallOptions {
  top?: number;
  engine?: string;
  format?: string;
  dryRun?: boolean;
  repo?: string;
}

export async function recall(query: string, options: RecallOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const config = loadConfig(repoRoot);

  // Override config with options
  const topK = options.top ?? config.memory.top_k;
  const engineName = options.engine ?? config.embedding.engine;

  // Get engine
  let engine: any;
  if (engineName === 'lancedb') {
    try {
      const { LanceDbEngine } = await import('../engines/lancedb-engine');
      engine = new LanceDbEngine();
    } catch (e) {
      console.error('LanceDB engine not available. Falling back to text engine.');
      console.error('To use LanceDB: npm install vectordb openai');
      engine = new TextEngine();
    }
  } else {
    engine = new TextEngine();
  }

  // Run recall
  const { results, markdown } = await runRecall(query, repoRoot, config, engine);

  // Write MEMORY.md unless dry-run
  if (!options.dryRun) {
    writeRecallResults(repoRoot, results, query, engineName);
  }

  // Output
  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(markdown);
  }
}