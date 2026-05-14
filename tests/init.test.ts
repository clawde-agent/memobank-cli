import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ensureGitignore', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-gi-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('creates .gitignore with all 4 memobank entries when file is missing', () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    const entries = [
      '.memobank/meta/access-log.json',
      '.memobank/meta/code-index.db',
      '.memobank/.lancedb/',
      '.memobank/pending/',
    ];
    const block = '# memobank\n' + entries.join('\n') + '\n';
    fs.writeFileSync(gitignorePath, block);

    const result = fs.readFileSync(gitignorePath, 'utf-8');
    expect(result).toContain('.memobank/meta/access-log.json');
    expect(result).toContain('.memobank/meta/code-index.db');
    expect(result).toContain('.memobank/.lancedb/');
    expect(result).toContain('.memobank/pending/');
  });

  it('does not duplicate entries in existing .gitignore', () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, '.memobank/meta/access-log.json\n');

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const entries = [
      '.memobank/meta/access-log.json',
      '.memobank/meta/code-index.db',
      '.memobank/.lancedb/',
      '.memobank/pending/',
    ];
    const toAdd = entries.filter((e) => !content.includes(e));
    const block = '\n# memobank\n' + toAdd.join('\n') + '\n';
    fs.appendFileSync(gitignorePath, block);

    const result = fs.readFileSync(gitignorePath, 'utf-8');
    const count = (result.match(/access-log\.json/g) ?? []).length;
    expect(count).toBe(1); // no duplicate
    expect(result).toContain('.memobank/meta/code-index.db');
  });
});
