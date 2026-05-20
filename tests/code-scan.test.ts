import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codeScanCommand } from '../src/commands/code-scan';
import { CodeIndex } from '../src/engines/code-index';

// Probe whether scanFile can actually extract symbols from a TypeScript file.
// tree-sitter may load without throwing but still produce 0 symbols when native
// bindings are partially broken (e.g., grammar compiled for a different Node ABI).
const treeSitterAvailable = (() => {
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ts-probe-'));
    const tmpFile = path.join(tmpDir, 'probe.ts');
    fs.writeFileSync(tmpFile, 'export function probe(): void {}');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { scanFile: probeScan } = require('../src/core/code-scanner') as {
      scanFile: (f: string, r: string) => { symbols: unknown[] };
    };
    const { symbols } = probeScan(tmpFile, tmpDir);
    fs.rmSync(tmpDir, { recursive: true });
    return symbols.length > 0;
  } catch {
    return false;
  }
})();

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-codescan-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

const describeScan = treeSitterAvailable ? describe : describe.skip;

describeScan('codeScanCommand', () => {
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

  it('accepts a list of files and only indexes those files (--incremental)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-scan-inc-'));
    const memoRoot = path.join(dir, '.memobank');
    fs.mkdirSync(path.join(memoRoot, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(memoRoot, 'meta', 'config.yaml'), 'project:\n  name: test\n');
    // Create a minimal TS file
    fs.writeFileSync(path.join(dir, 'foo.ts'), 'export function foo() { return 1; }\n');

    // Should not throw — no index exists yet, returns silently
    await expect(
      codeScanCommand(undefined, {
        incremental: true,
        files: [path.join(dir, 'foo.ts')],
        repo: memoRoot,
      })
    ).resolves.not.toThrow();

    fs.rmSync(dir, { recursive: true });
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
