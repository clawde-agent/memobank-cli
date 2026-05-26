import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeIndex } from '../src/engines/code-index';
import { codeContextCommand } from '../src/commands/code-context';

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-code-ctx-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  return dir;
}

function setupIndex(repoRoot: string): void {
  const dbPath = CodeIndex.getDbPath(repoRoot);
  const idx = new CodeIndex(dbPath);
  idx.upsertFile('src/auth.ts', 'typescript', 'h1', Date.now());
  idx.upsertFile('src/cli.ts', 'typescript', 'h2', Date.now());
  idx.upsertSymbols(
    'src/auth.ts',
    [
      {
        name: 'verifyToken',
        qualifiedName: 'verifyToken',
        kind: 'function' as const,
        file: 'src/auth.ts',
        lineStart: 1,
        lineEnd: 10,
        isExported: true,
        hash: 'hash-vt',
      },
    ],
    []
  );
  idx.upsertSymbols(
    'src/cli.ts',
    [
      {
        name: 'main',
        qualifiedName: 'main',
        kind: 'function' as const,
        file: 'src/cli.ts',
        lineStart: 1,
        lineEnd: 5,
        isExported: true,
        hash: 'hash-main',
      },
    ],
    [
      {
        sourceName: 'main',
        sourceFile: 'src/cli.ts',
        targetName: 'verifyToken',
        kind: 'calls',
        line: 3,
      },
    ]
  );
  idx.linkMemory('lesson/jwt.md', 'verifyToken raises on expired JWT');
  idx.close();
}

describe('codeContextCommand', () => {
  let tmpDir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    tmpDir = makeTmpRepo();
    setupIndex(tmpDir);
    logs = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '));
    };
  });

  afterEach(() => {
    console.log = origLog;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('prints callers and linked memories in text format', async () => {
    await codeContextCommand('verifyToken', { repo: tmpDir });
    const output = logs.join('\n');
    expect(output).toContain('main');
    expect(output).toContain('lesson/jwt.md');
  });

  it('outputs valid JSON in json format', async () => {
    await codeContextCommand('verifyToken', { repo: tmpDir, format: 'json' });
    const output = logs.join('\n');
    const parsed = JSON.parse(output) as {
      symbol: string;
      callers: unknown[];
      linkedMemories: unknown[];
    };
    expect(parsed.symbol).toBe('verifyToken');
    expect(parsed.callers.length).toBeGreaterThan(0);
    expect(parsed.linkedMemories.length).toBeGreaterThan(0);
  });
});
