/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 */

import { RecallResult, MemoConfig, MemoryScope } from '../types';
import { EngineAdapter } from '../engines/engine-adapter';
import { loadAll, writeMemoryMd } from './store';
import { TextEngine } from '../engines/text-engine';
import { recordAccess } from './lifecycle-manager';

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Recall memories for a query
 */
export async function recall(
  query: string,
  repoRoot: string,
  config: MemoConfig,
  engine?: EngineAdapter,
  scope: MemoryScope = 'all',
  explain: boolean = false
): Promise<{ results: RecallResult[]; markdown: string }> {
  const memories = loadAll(repoRoot, scope);
  const searchEngine = engine || new TextEngine();
  let results = await searchEngine.search(query, memories, config.memory.top_k);

  // Attach scope from memory file to result
  results = results.map(r => ({
    ...r,
    memory: { ...r.memory, scope: r.memory.scope },
  }));

  for (const result of results) {
    recordAccess(repoRoot, result.memory.path, query);
  }

  let markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length, scope, explain);
  let tokenCount = estimateTokenCount(markdown);

  if (tokenCount > config.memory.token_budget) {
    while (results.length > 0 && tokenCount > config.memory.token_budget) {
      results.pop();
      markdown = formatResultsAsMarkdown(results, query, config.embedding.engine, memories.length, scope, explain);
      tokenCount = estimateTokenCount(markdown);
    }
  }

  return { results, markdown };
}

function scopeLabel(scope?: MemoryScope | string): string {
  if (scope === 'team') { return '👥 team'; }
  if (scope === 'personal') { return '👤 personal'; }
  return '';
}

/**
 * Format recall results as markdown for MEMORY.md
 */
function formatResultsAsMarkdown(
  results: RecallResult[],
  query: string,
  engine: string,
  totalMemories: number,
  scope: MemoryScope = 'all',
  explain: boolean = false
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

      // Show scope label only when results come from both sources
      const showScope = scope === 'all' && memory.scope !== undefined;
      const sourcePart = showScope ? ` | ${scopeLabel(memory.scope)}` : '';

      markdown += `### [score: ${score.toFixed(2)}${sourcePart}] ${memory.name}${confidenceStr}\n`;

      if (explain && result.scoreBreakdown) {
        const b = result.scoreBreakdown;
        const parts = [`keyword(${b.keyword.toFixed(2)})`, `tags(${b.tags.toFixed(2)})`, `recency(${b.recency.toFixed(2)})`];
        markdown += `  matched: ${parts.join(' + ')}\n`;
      }

      markdown += `> ${memory.description}\n`;
      markdown += `> \`${relativePath}\`${tagStr}\n\n`;
    }
    markdown += `---\n*To flag a result: memo correct <file> --reason "not relevant"*\n\n`;
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
