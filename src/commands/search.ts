/**
 * Search command
 * Manual debugging - never writes MEMORY.md
 */

import { loadConfig } from '../config';
import { findRepoRoot, loadAll } from '../core/store';
import { TextEngine } from '../engines/text-engine';
import { EmbeddingGenerator } from '../core/embedding';
import type { MemoryFile } from '../types';
import type { LanceDbEngine } from '../engines/lancedb-engine';

export interface SearchOptions {
  engine?: string;
  tag?: string;
  type?: string;
  format?: string;
  repo?: string;
}

interface SearchResult {
  memory: MemoryFile;
  score: number;
}

export async function search(query: string, options: SearchOptions = {}): Promise<void> {
  // Validate query
  if (!query || !query.trim()) {
    console.error('Error: Query cannot be empty');
    process.exit(1);
  }

  if (query.length > 1000) {
    console.error('Error: Query too long (max 1000 characters)');
    process.exit(1);
  }

  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const config = loadConfig(repoRoot);

  // Load all memories
  let memories = loadAll(repoRoot);

  // Apply filters
  if (options.tag) {
    memories = memories.filter((m) => m.tags.includes(options.tag!));
  }

  if (options.type) {
    memories = memories.filter((m) => m.type === options.type);
  }

  // Get engine
  let engine: TextEngine | LanceDbEngine | undefined;
  const engineName = options.engine ?? config.embedding.engine;
  if (engineName === 'lancedb') {
    try {
      const { LanceDbEngine } = await import('../engines/lancedb-engine');
      const embedConfig = EmbeddingGenerator.fromMemoConfig(config);
      if (!embedConfig) {
        throw new Error('OPENAI_API_KEY not set or embedding config missing');
      }
      const embeddingGenerator = new EmbeddingGenerator(embedConfig);
      engine = new LanceDbEngine(repoRoot, embeddingGenerator);
    } catch (e) {
      const msg = (e as Error).message;
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
  } else {
    engine = new TextEngine();
  }

  // Run search
  const results = await engine.search(query, memories, config.memory.top_k);

  // Output
  if (options.format === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else {
    // Format as markdown (similar to recall but without MEMORY.md write)
    console.log(`## Search Results for "${query}"\n`);
    if (results.length === 0) {
      console.log('*No memories found*');
    } else {
      for (const result of results as SearchResult[]) {
        const { memory, score } = result;
        const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
        const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
        const relativePath = memory.path.replace(/^.*\/memobank\//, '');

        console.log(`### [${memory.type}] ${memory.name}${confidenceStr}`);
        console.log(`> ${memory.description}`);
        console.log(`> \`${relativePath}\`${tagStr}`);
        console.log(`> Score: ${score.toFixed(3)}\n`);
      }
    }
    console.log(`*${results.length} results · engine: ${engineName}*`);
  }
}
