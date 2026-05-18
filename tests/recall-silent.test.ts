import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-silent-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nmemory:\n  token_budget: 4000\n  top_k: 5\nembedding:\n  engine: text\nsearch:\n  use_tags: true\n  use_summary: true\nreview:\n  enabled: false\n'
  );
  return dir;
}

describe('recall --silent', () => {
  let dir: string;
  let writeSpy: jest.SpyInstance;
  let originalCwd: string;

  beforeEach(() => {
    dir = makeTempRepo();
    originalCwd = process.cwd();
    process.chdir(dir);
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    writeSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not write to stdout when --silent is set', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    await recallCommand('auth timeout error', { silent: true });
    // Check that no markdown/JSON output was written
    const callArgs = writeSpy.mock.calls.map((call) => call[0]).join('');
    expect(callArgs).not.toMatch(/##|{|\[/);
  });

  it('still writes MEMORY.md when --silent is set', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    await recallCommand('auth timeout error', { silent: true });
    const memPath = path.join(dir, 'MEMORY.md');
    expect(fs.existsSync(memPath)).toBe(true);
  });

  it('exits without throwing on empty memory store with --silent', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    await expect(recallCommand('some query', { silent: true })).resolves.toBeUndefined();
  });

  it('suppresses JSON output when --silent is set with --format json', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    await recallCommand('auth timeout error', { silent: true, format: 'json' });
    const callArgs = writeSpy.mock.calls.map((call) => call[0]).join('');
    expect(callArgs).not.toMatch(/{/);
  });
});
