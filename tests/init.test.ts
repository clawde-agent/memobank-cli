import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureGitignoreFull } from '../src/commands/init';

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

  it('does nothing when all entries already present', () => {
    const existing =
      '.memobank/meta/access-log.json\n.memobank/meta/code-index.db\n.memobank/.lancedb/\n.memobank/pending/\n';
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), existing);

    ensureGitignoreFull(tmpDir);

    const result = fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(result).toBe(existing);
  });
});
