import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot } from '../core/dir-resolver';
import { CodeIndex } from '../engines/code-index';

export interface CodeContextOptions {
  repo?: string;
  format?: 'text' | 'json';
}

export async function codeContextCommand(
  symbol: string,
  options: CodeContextOptions
): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const dbPath = CodeIndex.getDbPath(repoRoot);

  if (!CodeIndex.isAvailable()) {
    console.error('code-context requires better-sqlite3. Run: npm install better-sqlite3');
    process.exit(1);
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`No code index found at ${path.relative(repoRoot, dbPath)}. Run: memo code-scan`);
    process.exit(1);
  }

  const idx = new CodeIndex(dbPath);
  try {
    const callers = idx.getRefs(symbol);
    const linkedMemories = idx.getLinkedMemories(symbol);

    if (options.format === 'json') {
      console.log(JSON.stringify({ symbol, callers, linkedMemories }, null, 2));
      return;
    }

    console.log(`\nCode context for: ${symbol}\n`);

    if (callers.length === 0) {
      console.log('Callers: none indexed');
    } else {
      console.log(`Callers (${callers.length}):`);
      for (const r of callers) {
        console.log(`  ${r.symbol.file}:${r.symbol.lineStart}  ${r.symbol.qualifiedName}`);
      }
    }

    console.log('');

    if (linkedMemories.length === 0) {
      console.log('Linked memories: none');
    } else {
      console.log(`Linked memories (${linkedMemories.length}):`);
      for (const m of linkedMemories) {
        console.log(`  [depth ${m.minDepth}] ${m.memoryPath}`);
      }
    }
  } finally {
    idx.close();
  }
}
