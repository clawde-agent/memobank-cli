/**
 * Recall command
 * Search memories and write to MEMORY.md
 */

import { findRepoRoot } from '../core/store';
import { loadConfig } from '../config';
import { recall, writeRecallResults } from '../core/retriever';
import { TextEngine } from '../engines/text-engine';
import { EmbeddingGenerator } from '../core/embedding';
import { MemoryScope } from '../types';

export interface RecallOptions {
  top?: number;
  engine?: string;
  format?: string;
  dryRun?: boolean;
  repo?: string;
  scope?: string;
  explain?: boolean;
}

export async function recallCommand(query: string, options: RecallOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const config = loadConfig(repoRoot);

  if (options.top) { config.memory.top_k = parseInt(String(options.top), 10); }

  const scope = (options.scope as MemoryScope) || 'all';
  const explain = options.explain || false;

  let engine;
  if (options.engine === 'lancedb') {
    try {
      const { LanceDbEngine } = await import('../engines/lancedb-engine');
      const embedConfig = EmbeddingGenerator.fromMemoConfig(config);
      if (!embedConfig) {
        throw new Error('OPENAI_API_KEY not set or embedding config missing');
      }
      const embeddingGenerator = new EmbeddingGenerator(embedConfig);
      engine = new LanceDbEngine(repoRoot, embeddingGenerator);
    } catch {
      console.warn('LanceDB not available, falling back to text engine.');
      engine = new TextEngine();
    }
  }

  const { results, markdown } = await recall(query, repoRoot, config, engine, scope, explain);

  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(markdown);

  if (!options.dryRun) {
    writeRecallResults(repoRoot, results, query, config.embedding.engine);
  }
}
