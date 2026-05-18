/**
 * Recall command
 * Search memories and write to MEMORY.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from '../core/store';
import { readSceneIndex } from '../core/scene-index';
import { generateSceneNavigation, stripSceneNavigation } from '../core/scene-navigation';
import { loadConfig } from '../config';
import { recall, writeRecallResults } from '../core/retriever';
import { TextEngine } from '../engines/text-engine';
import { HybridEngine } from '../engines/hybrid-engine';
import { EmbeddingGenerator } from '../core/embedding';
import type { MemoryScope } from '../types';
import type { EmbeddingConfig } from '../core/embedding';
import type { EngineAdapter } from '../engines/engine-adapter';

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
  silent?: boolean;
}

export async function selectEngine(
  engineName: string,
  repoRoot: string,
  embedConfig: EmbeddingConfig | null
): Promise<{ engine: EngineAdapter; warning: string | null }> {
  if (engineName !== 'lancedb') {
    return { engine: new TextEngine(), warning: null };
  }
  if (!embedConfig) {
    const warning = `⚠  Vector search unavailable (embedding config missing or API key not set)\n  Falling back to text search.`;
    return { engine: new TextEngine(), warning };
  }
  try {
    const { LanceDbEngine } = await import('../engines/lancedb-engine');
    const { EmbeddingGenerator } = await import('../core/embedding');
    // Validate API key before constructing — fail fast for cloud providers
    const provider = embedConfig.provider ?? 'ollama';
    if (provider !== 'ollama' && provider !== 'custom') {
      const keyMap: Record<string, string | undefined> = {
        openai: process.env.OPENAI_API_KEY,
        azure: process.env.OPENAI_API_KEY ?? process.env.AZURE_API_KEY,
        jina: process.env.JINA_API_KEY,
      };
      const key = keyMap[provider] ?? process.env.OPENAI_API_KEY;
      if (!key) {
        throw new Error(`${provider.toUpperCase()}_API_KEY is not set`);
      }
    }
    const embeddingGenerator = new EmbeddingGenerator(embedConfig);
    const lanceEngine = new LanceDbEngine(repoRoot, embeddingGenerator);
    const textEngine = new TextEngine();
    return { engine: new HybridEngine(textEngine, lanceEngine), warning: null };
  } catch (err) {
    const msg = (err as Error).message;
    const provider = embedConfig.provider ?? 'ollama';
    const model = embedConfig.model ?? 'mxbai-embed-large';
    const hint =
      provider === 'ollama'
        ? `  Check: ollama serve && ollama pull ${model}`
        : `  Check: ${provider.toUpperCase()}_API_KEY is set`;
    const warning = `⚠  Vector search unavailable (${msg})\n${hint}\n  Falling back to text search.`;
    return { engine: new TextEngine(), warning };
  }
}

export async function recallCommand(query: string, options: RecallOptions): Promise<void> {
  // Validate query
  if (!query || !query.trim()) {
    throw new Error('Query cannot be empty');
  }

  if (query.length > 1000) {
    throw new Error('Query too long (max 1000 characters)');
  }

  // Validate top
  if (options.top !== undefined) {
    const topVal = typeof options.top === 'string' ? parseInt(options.top, 10) : options.top;
    if (isNaN(topVal) || topVal < 1) {
      throw new Error('--top must be a positive integer');
    }
    if (topVal > 100) {
      throw new Error('--top cannot exceed 100');
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
      try {
        const refs = idx.getRefs(options.refs);
        if (refs.length === 0) {
          if (!options.silent) {
            process.stdout.write(`No callers found for: ${options.refs}\n`);
          }
          return;
        }
        if (!options.silent) {
          process.stdout.write(`\n## Callers of \`${options.refs}\` (${refs.length})\n\n`);
          for (const r of refs) {
            process.stdout.write(
              `- ${r.symbol.qualifiedName}  ${r.symbol.file}:${r.symbol.lineStart}\n`
            );
          }
        }
      } finally {
        idx.close();
      }
      return;
    } catch {
      console.error('Code index unavailable. Run: npm install memobank-cli --include=optional');
      return;
    }
  }

  const config = loadConfig(repoRoot);

  if (options.top) {
    config.memory.top_k = typeof options.top === 'string' ? parseInt(options.top, 10) : options.top;
  }

  const scope = (options.scope as MemoryScope) || 'all';
  const explain = options.explain || false;

  // Determine engine: explicit --engine flag overrides config
  const engineName = options.engine ?? config.embedding.engine;
  const embedConfig = EmbeddingGenerator.fromMemoConfig(config);
  const { engine, warning } = await selectEngine(engineName, repoRoot, embedConfig);
  if (warning && !options.silent) {
    process.stderr.write('\n' + warning + '\n\n');
  }

  const { results, markdown, symbolResults } = await recall(
    query,
    repoRoot,
    config,
    engine,
    scope,
    explain,
    options.code ?? 'auto'
  );

  if (options.format === 'json') {
    if (!options.silent) {
      process.stdout.write(JSON.stringify({ results, symbolResults }, null, 2) + '\n');
    }
    return;
  }

  if (!options.silent) {
    process.stdout.write(markdown + '\n');
  }

  const actualEngineName =
    engine instanceof TextEngine && engineName === 'lancedb'
      ? 'text (fallback from lancedb)'
      : engineName;

  if (!options.dryRun) {
    writeRecallResults(repoRoot, results, query, actualEngineName);

    // Append scene navigation if scenes exist
    const sceneIndex = await readSceneIndex(repoRoot);
    if (sceneIndex.length > 0) {
      const memoryPath = path.join(repoRoot, 'MEMORY.md');
      const existing = fs.existsSync(memoryPath) ? fs.readFileSync(memoryPath, 'utf-8') : '';
      const stripped = stripSceneNavigation(existing);
      const nav = generateSceneNavigation(repoRoot, sceneIndex);
      fs.writeFileSync(memoryPath, stripped + '\n\n' + nav, 'utf-8');
    }
  }
}
