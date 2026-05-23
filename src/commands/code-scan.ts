import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, writeMemory } from '../core/store';
import { scanFile, detectLanguage, SUPPORTED_EXTENSIONS } from '../core/code-scanner';
import { CodeIndex } from '../engines/code-index';
import { buildMemoryGraph } from '../engines/memory-graph';
import type { CodeScanOptions, IndexedLanguage } from '../types';

const SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.turbo',
  'out',
  'tmp',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  'target',
  'vendor',
  '.svelte-kit',
  'htmlcov',
  '.terraform',
  'bin',
  'obj',
  '.vs',
  'packages',
];

function collectFiles(scanRoot: string, langs: Set<IndexedLanguage> | null): string[] {
  const allowedExts = langs
    ? new Set(
        [...SUPPORTED_EXTENSIONS.entries()]
          .filter(([, lang]) => langs.has(lang))
          .map(([ext]) => ext)
      )
    : null;

  const results: string[] = [];

  function walk(dir: string): void {
    const base = path.basename(dir);
    if (SKIP_DIRS.includes(base)) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExts ? allowedExts.has(ext) : SUPPORTED_EXTENSIONS.has(ext)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(scanRoot);
  return results;
}

export async function codeScanCommand(
  scanPath: string | undefined,
  options: CodeScanOptions
): Promise<void> {
  if (!CodeIndex.isAvailable()) {
    console.error(
      '⚠  memo index requires optional dependencies. Run:\n  npm install memobank-cli --include=optional'
    );
    process.exit(1);
  }

  if (!CodeIndex.isParserAvailable()) {
    console.error(
      '⚠  memo index requires tree-sitter (optional dependency not installed). Run:\n  npm install memobank-cli --include=optional'
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);

  // Incremental mode: only scan the explicitly provided files
  if (options.incremental && options.files && options.files.length > 0) {
    const dbPath = CodeIndex.getDbPath(repoRoot);
    const metaDir = path.dirname(dbPath);
    if (!fs.existsSync(metaDir)) {
      // No index yet — skip silently (index hasn't been initialized)
      return;
    }
    const idx = new CodeIndex(dbPath);
    let indexed = 0;
    for (const filePath of options.files) {
      if (!fs.existsSync(filePath)) continue;
      const lang = detectLanguage(filePath);
      if (!lang) continue;
      const { hash, symbols, edges } = scanFile(filePath, path.dirname(filePath));
      const relPath = path.relative(cwd, filePath);
      if (!options.force && !idx.needsReindex(relPath, hash)) continue;
      idx.upsertFile(relPath, lang, hash, fs.statSync(filePath).mtimeMs);
      idx.upsertSymbols(relPath, symbols, edges);
      indexed++;
    }
    idx.close();
    if (!options.summarize) {
      console.log(`Incremental index: ${indexed} file(s) updated`);
    }
    return;
  }

  const scanRoot = scanPath ? path.resolve(scanPath) : cwd;

  if (!fs.existsSync(scanRoot)) {
    console.error(`Error: scan path does not exist: ${scanRoot}`);
    process.exit(1);
  }

  const langs: Set<IndexedLanguage> | null =
    options.langs && options.langs.length > 0 ? new Set(options.langs) : null;

  const files = collectFiles(scanRoot, langs);
  console.log(`Scanning ${files.length} files in ${scanRoot}`);

  const dbPath = CodeIndex.getDbPath(repoRoot);
  const metaDir = path.dirname(dbPath);
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }

  const idx = new CodeIndex(dbPath);
  const langCounts = new Map<string, number>();

  let indexed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const lang = detectLanguage(filePath);
    if (!lang) {
      continue;
    }

    const { hash, symbols, edges } = scanFile(filePath, scanRoot);
    const relPath = path.relative(scanRoot, filePath);

    if (!options.force && !idx.needsReindex(relPath, hash)) {
      skipped++;
      continue;
    }

    idx.upsertFile(relPath, lang, hash, fs.statSync(filePath).mtimeMs);
    idx.upsertSymbols(relPath, symbols, edges);

    langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    indexed++;
  }

  const stats = idx.getStats();

  // Build memory-node graph after symbol index is populated
  try {
    await buildMemoryGraph((idx as any).db, repoRoot);
  } catch {
    // non-fatal — graph is rebuilt on next run
  }

  idx.close();

  console.log(`Indexed: ${indexed} files  Skipped (unchanged): ${skipped}`);
  console.log(`Symbols: ${stats.symbols}  Edges: ${stats.edges}`);

  if (options.summarize) {
    const langSummary = [...langCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `- ${lang}: ${count} files`)
      .join('\n');

    const content = `## Code Structure Snapshot

### Languages Indexed
${langSummary || '(none)'}

### Statistics
- Total files: ${stats.files}
- Total symbols: ${stats.symbols}
- Total edges (call/import graph): ${stats.edges}

Generated by \`memo index\` on ${new Date().toISOString().split('T')[0]}.
`;

    const filePath = writeMemory(repoRoot, {
      name: 'project-architecture-snapshot',
      type: 'architecture',
      description: 'Auto-generated code structure snapshot from memo index',
      tags: ['architecture', 'codebase', 'auto-generated'],
      confidence: 'high',
      status: 'active',
      created: new Date().toISOString().split('T')[0],
      content,
    });

    console.log(`Architecture memory written: ${filePath}`);
  }
}
