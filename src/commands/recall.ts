/**
 * Recall command
 * Search memories and write to MEMORY.md
 */

import { findRepoRoot } from '../core/store';
import { loadConfig } from '../config';
import { recall, writeRecallResults } from '../core/retriever';
import { TextEngine } from '../engines/text-engine';
import { EmbeddingGenerator } from '../core/embedding';
import type { MemoryScope } from '../types';

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

  if (options.top) {
    config.memory.top_k = options.top;
  }

  const scope = (options.scope as MemoryScope) || 'all';
  const explain = options.explain || false;

  let engine;
  if (options.engine === 'lancedb') {
    try {
      const { LanceDbEngine } = await import('../engines/lancedb-engine');
      const embedConfig = EmbeddingGenerator.fromMemoConfig(config);
      if (!embedConfig) {
        throw new Error('embedding config missing or API key not set');
      }
      const embeddingGenerator = new EmbeddingGenerator(embedConfig);
      engine = new LanceDbEngine(repoRoot, embeddingGenerator);
    } catch (err) {
      const msg = (err as Error).message;
      const provider = config.embedding?.provider ?? 'ollama';
      const model = config.embedding?.model ?? 'mxbai-embed-large';
      const hint =
        provider === 'ollama'
          ? `  Check: ollama serve && ollama pull ${model}`
          : `  Check: ${provider.toUpperCase()}_API_KEY is set`;
      process.stderr.write(
        `\n⚠  Vector search unavailable (${msg})\n${hint}\n  Falling back to text search.\n\n`
      );
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
