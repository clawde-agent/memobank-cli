import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureGitignoreFull, quickInit } from '../src/commands/init';

describe('ensureGitignoreFull', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-gi-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates .gitignore with all 4 memobank entries when file is missing', () => {
    ensureGitignoreFull(tmpDir);

    const result = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(result).toContain('.memobank/meta/access-log.json');
    expect(result).toContain('.memobank/meta/code-index.db');
    expect(result).toContain('.memobank/.lancedb/');
    expect(result).toContain('.memobank/pending/');
  });

  it('appends missing entries to existing .gitignore without duplicating', () => {
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '.memobank/meta/access-log.json\n');

    ensureGitignoreFull(tmpDir);

    const result = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    const count = (result.match(/access-log\.json/g) ?? []).length;
    expect(count).toBe(1);
    expect(result).toContain('.memobank/meta/code-index.db');
    expect(result).toContain('.memobank/.lancedb/');
    expect(result).toContain('.memobank/pending/');
  });

  it('does nothing when all entries are already present', () => {
    const existing =
      '.memobank/meta/access-log.json\n.memobank/meta/code-index.db\n.memobank/.lancedb/\n.memobank/pending/\n';
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), existing);

    ensureGitignoreFull(tmpDir);

    const result = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(result).toBe(existing);
  });
});

describe('quickInit — hook installation', () => {
  it('installs post-commit hook when git repo exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-init-hook-'));
    fs.mkdirSync(path.join(dir, '.git', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'config'), '[core]\n  repositoryformatversion = 0\n');

    await quickInit({ repoRoot: dir, platform: 'none' });

    const { isHookInstalled } = await import('../src/core/hook-installer');
    expect(isHookInstalled(dir)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });
});
