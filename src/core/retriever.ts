/**
 * Retriever module
 * Orchestrates engine search and formats output for MEMORY.md injection
 */

import * as path from 'path';
import * as fs from 'fs';
import type { RecallResult, MemoConfig, MemoryScope, SymbolResult } from '../types';
import type { CodeIndex as CodeIndexType } from '../engines/code-index';
import type { EngineAdapter } from '../engines/engine-adapter';
import { loadAll, writeMemoryMd, getGlobalDir, getWorkspaceDir } from './store';
import { TextEngine } from '../engines/text-engine';
import { recordAccess, loadAccessLogs, updateStatusOnRecall } from './lifecycle-manager';
import { rerank } from './reranker';

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
  scope: MemoryScope | 'all' = 'all',
  explain: boolean = false,
  withCode: boolean | 'auto' = 'auto'
): Promise<{ results: RecallResult[]; markdown: string; symbolResults?: SymbolResult[] }> {
  const autoCode: boolean =
    withCode === 'auto'
      ? (() => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { CodeIndex } = require('../engines/code-index') as {
              CodeIndex: typeof CodeIndexType;
            };
            return fs.existsSync(CodeIndex.getDbPath(repoRoot));
          } catch {
            return false;
          }
        })()
      : withCode;
  const globalDir = getGlobalDir(config.project.name);
  const workspaceDir = config.workspace?.enabled
    ? getWorkspaceDir(path.basename(config.workspace.remote ?? '', '.git'))
    : undefined;
  const memories = loadAll(repoRoot, scope, globalDir, workspaceDir);
  const searchEngine = engine || new TextEngine();
  const accessLogs = loadAccessLogs(repoRoot);
  let symbolResults: SymbolResult[] | undefined;

  let linkedMemories: { memoryPath: string; minDepth: number }[] = [];
  if (autoCode) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { CodeIndex } = require('../engines/code-index') as { CodeIndex: typeof CodeIndexType };
      const dbPath = CodeIndex.getDbPath(repoRoot);
      if (fs.existsSync(dbPath)) {
        const idx = new CodeIndex(dbPath);
        symbolResults = idx.search(query, config.memory.top_k ?? 10);
        linkedMemories = idx.getLinkedMemories(query);
        idx.close();
      }
    } catch {
      // better-sqlite3 not installed — silently skip
    }
  }

  let results = await searchEngine.search(query, memories, config.memory.top_k);

  // Graph boost: memories linked to symbols reachable from query via call graph
  if (linkedMemories.length > 0) {
    const depthMap = new Map(linkedMemories.map((l) => [l.memoryPath, l.minDepth]));
    results = results.map((r) => {
      const depth = depthMap.get(r.memory.path);
      if (depth === undefined) return r;
      return { ...r, score: Math.min(1.0, r.score + 0.5 / (depth + 1)) };
    });
  }

  // Apply access frequency boost
  results = results.map((result) => {
    const log = accessLogs[result.memory.path];
    const accessCount = log?.accessCount ?? 0;
    const boost = Math.min(1.5, 1.0 + Math.log1p(accessCount) / 10);
    return { ...result, score: Math.min(1.0, result.score * boost) };
  });
  results.sort((a, b) => b.score - a.score);

  for (const result of results) {
    recordAccess(repoRoot, result.memory.path, query);
  }

  // Update status for recalled memories
  for (const result of results) {
    updateStatusOnRecall(repoRoot, result.memory.path);
  }

  // Apply reranker if configured
  if (config.reranker?.enabled && results.length > 1) {
    try {
      results = await rerank(query, results, {
        provider: config.reranker.provider,
        model: config.reranker.model,
        top_n: config.reranker.top_n ?? config.memory.top_k,
      });
    } catch (e) {
      // Reranker failure is non-fatal — use original order
      console.warn(`Reranker skipped: ${(e as Error).message}`);
    }
  }

  if (explain && results.length > 0 && results.every((r) => !r.scoreBreakdown)) {
    console.warn('--explain: score breakdown not available for the current engine.');
  }

  let markdown = formatResultsAsMarkdown(
    results,
    query,
    config.embedding.engine,
    memories.length,
    scope,
    explain
  );
  let tokenCount = estimateTokenCount(markdown);

  if (tokenCount > config.memory.token_budget) {
    while (results.length > 0 && tokenCount > config.memory.token_budget) {
      results.pop();
      markdown = formatResultsAsMarkdown(
        results,
        query,
        config.embedding.engine,
        memories.length,
        scope,
        explain
      );
      tokenCount = estimateTokenCount(markdown);
    }
  }

  if (symbolResults && symbolResults.length > 0) {
    markdown += '\n\n## Code Symbols\n\n';
    for (const sr of symbolResults) {
      markdown += formatSymbolResult(sr);
    }
  }

  return { results, markdown, symbolResults };
}

function scopeLabel(scope?: MemoryScope): string {
  if (scope === 'workspace') {
    return '🌐 workspace';
  }
  if (scope === 'project') {
    return '📁 project';
  }
  if (scope === 'personal') {
    return '👤 personal';
  }
  return '';
}

function formatSymbolResult(result: SymbolResult): string {
  const { symbol, score } = result;
  const docLine = symbol.docstring ? `> ${symbol.docstring}\n` : '';
  return (
    `### [score: ${score.toFixed(2)} | symbol] ${symbol.qualifiedName}\n\n` +
    docLine +
    `> \`${symbol.file}:${symbol.lineStart}–${symbol.lineEnd}\` · ${symbol.kind}\n\n` +
    `---\n\n` +
    (symbol.signature ? `${symbol.signature}\n` : '')
  );
}

/**
 * Format recall results as markdown for MEMORY.md
 */
function formatResultsAsMarkdown(
  results: RecallResult[],
  query: string,
  engine: string,
  totalMemories: number,
  scope: MemoryScope | 'all' = 'all',
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
        const parts = [
          `keyword(${b.keyword.toFixed(2)})`,
          `tags(${b.tags.toFixed(2)})`,
          `recency(${b.recency.toFixed(2)})`,
        ];
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
