/**
 * Search command
 * Manual debugging - never writes MEMORY.md
 */

import { recall as runRecall } from '../core/retriever';
import { loadConfig } from '../config';
import { findRepoRoot, loadAll } from '../core/store';
import { TextEngine } from '../engines/text-engine';
import { MemoryFile } from '../types';

export interface SearchOptions {
  engine?: string;
  tag?: string;
  type?: string;
  format?: string;
  repo?: string;
}

export async function search(query: string, options: SearchOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const config = loadConfig(repoRoot);

  // Load all memories
  let memories = loadAll(repoRoot);

  // Apply filters
  if (options.tag) {
    memories = memories.filter(m => m.tags.includes(options.tag!));
  }

  if (options.type) {
    memories = memories.filter(m => m.type === options.type);
  }

  // Get engine
  let engine: any;
  const engineName = options.engine ?? config.embedding.engine;
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
      for (const result of results) {
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
