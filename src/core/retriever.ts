import * as fs from 'fs';
import * as path from 'path';
import type { RecallResult, MemoConfig, MemoryScope, SymbolResult, MemoryFile } from '../types';
import type { CodeIndex as CodeIndexType } from '../engines/code-index';
import type { EngineAdapter } from '../engines/engine-adapter';
import { loadAll } from './memory-loader';
import { getGlobalDir, resolveWorkspaceDir } from './dir-resolver';
import { TextEngine } from '../engines/text-engine';
import { recordAccess, loadAccessLogs, updateStatusOnRecall } from './lifecycle-manager';
import { rerank } from './reranker';
import { rank } from './recall-ranker';

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function loadCodeIndex(
  repoRoot: string,
  withCode: boolean,
  query?: string,
  topK?: number
): Promise<{
  symbolResults: SymbolResult[];
  linkedMemories: { memoryPath: string; minDepth: number }[];
} | null> {
  if (!withCode) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CodeIndex } = require('../engines/code-index') as { CodeIndex: typeof CodeIndexType };
    const dbPath = CodeIndex.getDbPath(repoRoot);
    if (!fs.existsSync(dbPath)) return null;
    const idx = new CodeIndex(dbPath);
    try {
      const symbolResults = idx.search(query ?? '', topK ?? 10);
      const linkedMemories = idx.getLinkedMemories(query ?? '');
      return { symbolResults, linkedMemories };
    } finally {
      idx.close();
    }
  } catch {
    return null;
  }
}

function resolveAutoCode(withCode: boolean | 'auto', repoRoot: string): boolean {
  if (withCode !== 'auto') return withCode;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CodeIndex } = require('../engines/code-index') as { CodeIndex: typeof CodeIndexType };
    return fs.existsSync(CodeIndex.getDbPath(repoRoot));
  } catch {
    return false;
  }
}

function recordAccessBatch(repoRoot: string, results: RecallResult[], query: string): void {
  for (const result of results) {
    recordAccess(repoRoot, result.memory.path, query);
  }
  for (const result of results) {
    updateStatusOnRecall(repoRoot, result.memory.path);
  }
}

async function applyReranker(
  query: string,
  results: RecallResult[],
  config: MemoConfig
): Promise<RecallResult[]> {
  if (!config.reranker?.enabled || results.length <= 1) return results;
  try {
    return await rerank(query, results, {
      provider: config.reranker.provider,
      model: config.reranker.model,
      top_n: config.reranker.top_n ?? config.memory.top_k,
      baseUrl: config.reranker.base_url,
    });
  } catch (e) {
    console.warn(`Reranker skipped: ${(e as Error).message}`);
    return results;
  }
}

export function budgetResults(results: RecallResult[], tokenBudget: number): RecallResult[] {
  if (results.length === 0) return results;

  // Estimate tokens per-result once to avoid O(n²) full-markdown rebuild on each pop.
  let runningTokens = 50; // fixed overhead: header + footer (~200 chars / 4)
  const kept: RecallResult[] = [];
  for (const result of results) {
    const { memory } = result;
    const approxLine = `### ${memory.name}\n> ${memory.description}\n> \`${memory.path}\`\n\n`;
    const cost = estimateTokenCount(approxLine);
    if (runningTokens + cost > tokenBudget && kept.length > 0) break;
    runningTokens += cost;
    kept.push(result);
  }
  return kept;
}

export async function recall(
  query: string,
  repoRoot: string,
  config: MemoConfig,
  engine?: EngineAdapter,
  scope: MemoryScope | 'all' = 'all',
  explain: boolean = false,
  withCode: boolean | 'auto' = 'auto'
): Promise<{ results: RecallResult[]; markdown: string; symbolResults?: SymbolResult[] }> {
  const autoCode = resolveAutoCode(withCode, repoRoot);
  const globalDir = getGlobalDir(config.project.name);
  const workspaceDir = config.workspace ? resolveWorkspaceDir(config.workspace) : undefined;
  const memories = loadAll(repoRoot, scope, globalDir, workspaceDir);
  const searchEngine = engine || new TextEngine();
  const accessLogs = loadAccessLogs(repoRoot);

  const codeResult = await loadCodeIndex(repoRoot, autoCode, query, config.memory.top_k);
  const graphScores = codeResult
    ? new Map(codeResult.linkedMemories.map((l) => [l.memoryPath, l.minDepth]))
    : undefined;

  const rawResults = await searchEngine.search(query, memories, config.memory.top_k);
  let results = rank(rawResults, { graphScores, accessLogs });

  recordAccessBatch(repoRoot, results, query);
  results = await applyReranker(query, results, config);

  if (explain && results.length > 0 && results.every((r) => !r.scoreBreakdown)) {
    console.warn('--explain: score breakdown not available for the current engine.');
  }

  results = budgetResults(results, config.memory.token_budget);
  const markdown = formatResultsAsMarkdown(
    results,
    query,
    config.embedding.engine,
    memories.length,
    scope,
    explain
  );

  if (codeResult?.symbolResults && codeResult.symbolResults.length > 0) {
    const symbolMd = codeResult.symbolResults.map(formatSymbolResult).join('');
    return {
      results,
      markdown: markdown + '\n\n## Code Symbols\n\n' + symbolMd,
      symbolResults: codeResult.symbolResults,
    };
  }

  return { results, markdown, symbolResults: codeResult?.symbolResults };
}

function scopeLabel(scope?: MemoryScope): string {
  if (scope === 'workspace') return '🌐 workspace';
  if (scope === 'project') return '📁 project';
  if (scope === 'personal') return '👤 personal';
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
      if (memory.codeRefs && memory.codeRefs.length > 0) {
        markdown += `> refs: ${memory.codeRefs.join(', ')}\n`;
      }
      markdown += `> \`${relativePath}\`${tagStr}\n\n`;
    }
    markdown += `---\n*To flag a result: memo correct <file> --reason "not relevant"*\n\n`;
  }

  const tokenCount = estimateTokenCount(markdown);
  markdown += `---\n`;
  markdown += `*${results.length} of ${totalMemories} memories · engine: ${engine} · ~${tokenCount} tokens*`;

  return markdown;
}

function writeMemoryMd(
  repoRoot: string,
  results: Array<{ memory: MemoryFile; score: number }>,
  query: string,
  engine: string
): void {
  if (!fs.existsSync(repoRoot)) {
    fs.mkdirSync(repoRoot, { recursive: true });
  }
  const filePath = path.join(repoRoot, 'MEMORY.md');

  let markdown = `<!-- Last updated: ${new Date().toISOString()} | query: "${query}" | engine: ${engine} | top ${results.length} -->\n\n`;
  markdown += `## Recalled Memory\n\n`;

  if (results.length === 0) {
    markdown += `*No memories found for "${query}"*\n`;
  } else {
    for (const result of results) {
      const { memory } = result;
      const relativePath = path.relative(repoRoot, memory.path);
      const confidenceStr = memory.confidence ? ` · ${memory.confidence} confidence` : '';
      const tagStr = memory.tags.length > 0 ? ` · tags: ${memory.tags.join(', ')}` : '';
      markdown += `### [${memory.type}] ${memory.name}${confidenceStr}\n`;
      markdown += `> ${memory.description}\n`;
      if (memory.codeRefs && memory.codeRefs.length > 0) {
        markdown += `> refs: ${memory.codeRefs.join(', ')}\n`;
      }
      markdown += `> \`${relativePath}\`${tagStr}\n\n`;
    }
  }
  markdown += `---\n`;
  markdown += `*${results.length} memories · engine: ${engine}*`;
  fs.writeFileSync(filePath, markdown, 'utf-8');
}

export function writeRecallResults(
  repoRoot: string,
  results: RecallResult[],
  query: string,
  engine: string
): void {
  writeMemoryMd(repoRoot, results, query, engine);
}
