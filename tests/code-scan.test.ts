import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codeScanCommand } from '../src/commands/code-scan';
import { CodeIndex } from '../src/engines/code-index';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-codescan-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('codeScanCommand', () => {
  it('creates code-index.db after scanning a directory with TS files', async () => {
    const repoRoot = makeTempRepo();
    const srcDir = path.join(repoRoot, 'src-fixture');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'hello.ts'),
      `export function greet(name: string): string { return 'hi ' + name; }`
    );

    await codeScanCommand(srcDir, { repo: repoRoot });

    const dbPath = path.join(repoRoot, 'meta', 'code-index.db');
    expect(fs.existsSync(dbPath)).toBe(true);

    const idx = new CodeIndex(dbPath);
    const stats = idx.getStats();
    expect(stats.symbols).toBeGreaterThan(0);
    idx.close();

    fs.rmSync(repoRoot, { recursive: true });
  });

  it('skips unchanged files on second scan (hash cache)', async () => {
    const repoRoot = makeTempRepo();
    const srcDir = path.join(repoRoot, 'src-fixture2');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'hello.ts'),
      `export function greet(name: string): string { return 'hi'; }`
    );

    await codeScanCommand(srcDir, { repo: repoRoot });
    const dbPath = path.join(repoRoot, 'meta', 'code-index.db');
    const idx = new CodeIndex(dbPath);
    const statsFirst = idx.getStats();
    idx.close();

    await codeScanCommand(srcDir, { repo: repoRoot });
    const idx2 = new CodeIndex(dbPath);
    const statsSecond = idx2.getStats();
    idx2.close();

    expect(statsSecond.symbols).toBe(statsFirst.symbols);

    fs.rmSync(repoRoot, { recursive: true });
  });
});
