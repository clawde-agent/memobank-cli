/**
 * Recall command
 * Search memories and write to MEMORY.md
 */

import * as fs from 'fs';
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
  code?: boolean;
  refs?: string;
}

export async function recallCommand(query: string, options: RecallOptions): Promise<void> {
  // Validate query
  if (!query || !query.trim()) {
    console.error('Error: Query cannot be empty');
    process.exit(1);
  }

  if (query.length > 1000) {
    console.error('Error: Query too long (max 1000 characters)');
    process.exit(1);
  }

  // Validate top
  if (options.top !== undefined) {
    if (!Number.isInteger(options.top) || options.top < 1) {
      console.error('Error: --top must be a positive integer');
      process.exit(1);
    }
    if (options.top > 100) {
      console.error('Error: --top cannot exceed 100');
      process.exit(1);
    }
  }

  const repoRoot = findRepoRoot(process.cwd(), options.repo);

  if (options.refs) {
    try {
      const { CodeIndex } = await import('../engines/code-index');
      const dbPath = CodeIndex.getDbPath(repoRoot);
      if (!fs.existsSync(dbPath)) {
        console.error('No code index found. Run: memo index-code [path]');
        return;
      }
      const idx = new CodeIndex(dbPath);
      const refs = idx.getRefs(options.refs);
      idx.close();
      if (refs.length === 0) {
        console.log(`No callers found for: ${options.refs}`);
        return;
      }
      console.log(`\n## Callers of \`${options.refs}\` (${refs.length})\n`);
      for (const r of refs) {
        console.log(`- ${r.symbol.qualifiedName}  ${r.symbol.file}:${r.symbol.lineStart}`);
      }
      return;
    } catch {
      console.error('Code index unavailable. Run: npm install memobank-cli --include=optional');
      return;
    }
  }

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

  const { results, markdown, symbolResults } = await recall(
    query,
    repoRoot,
    config,
    engine,
    scope,
    explain,
    options.code ?? false
  );

  if (options.format === 'json') {
    console.log(JSON.stringify({ results, symbolResults }, null, 2));
    return;
  }

  console.log(markdown);

  if (!options.dryRun) {
    writeRecallResults(repoRoot, results, query, config.embedding.engine);
  }
}
