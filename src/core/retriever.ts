/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 * Tracks access patterns for lifecycle management
 */

import { RecallResult, MemoConfig } from '../types';
import { EngineAdapter } from '../engines/engine-adapter';
import { loadAll, writeMemoryMd, findRepoRoot } from './store';
import { TextEngine } from '../engines/text-engine';
import { recordAccess } from './lifecycle-manager';

// Simple token estimation (rough approximation: ~4 chars per token)
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Recall memories for a query
 * Returns both the results and formatted markdown
 * Records access for lifecycle tracking
 */
export async function recall(
  query: string,
  repoRoot: string,
  config: MemoConfig,
  engine?: EngineAdapter
): Promise<{ results: RecallResult[]; markdown: string }> {
  // Load all memories
  const memories = loadAll(repoRoot);

  // Use provided engine or default to text engine
  const searchEngine = engine || new TextEngine();

  // Run search
  let results = await searchEngine.search(query, memories, config.memory.top_k);

  // Record access for each recalled memory
  for (const result of results) {
    recordAccess(repoRoot, result.memory.path, query);
  }

  // Truncate if over token budget
  let markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length);
  let tokenCount = estimateTokenCount(markdown);

  if (tokenCount > config.memory.token_budget) {
    // Remove results until under budget
    while (results.length > 0 && tokenCount > config.memory.token_budget) {
      results.pop();
      markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length);
      tokenCount = estimateTokenCount(markdown);
    }
  }

  return { results, markdown };
}

/**
 * Format recall results as markdown for MEMORY.md
 */
function formatResultsAsMarkdown(
  results: RecallResult[],
  query: string,
  engine: string,
  totalMemories: number
): string {
  let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} of ${totalMemories} -->\n\n`;
  markdown += `## Recalled Memory\n\n`;

  if (results.length === 0) {
    markdown += `*No memories found for "${query}"*\n`;
  } else {
    for (const result of results) {
      const { memory, score } = result;
      const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
      const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
      const relativePath = memory.path.replace(/^.*\/memobank\//, '');

      markdown += `### [${memory.type}] ${memory.name}${confidenceStr}\n`;
      markdown += `> ${memory.description}\n`;
      markdown += `> \`${relativePath}\`${tagStr}\n\n`;
    }
  }

  const tokenCount = estimateTokenCount(markdown);
  markdown += `---\n`;
  markdown += `*${results.length} of ${totalMemories} memories · engine: ${engine} · ~${tokenCount} tokens*`;

  return markdown;
}

/**
 * Write recall results to MEMORY.md
 */
export function writeRecallResults(
  repoRoot: string,
  results: RecallResult[],
  query: string,
  engine: string
): void {
  writeMemoryMd(repoRoot, results, query, engine);
}
