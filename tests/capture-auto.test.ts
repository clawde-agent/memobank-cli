import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { capture } from '../src/commands/capture';
import { appendToSessionLog } from '../src/core/session-log';

describe('capture --auto', () => {
  it('exits cleanly when no transcript directory exists', async () => {
    const tmpDir = path.join(os.tmpdir(), `capture-auto-test-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.memobank', 'meta'), { recursive: true });
    await fs.writeFile(
      path.join(tmpDir, '.memobank', 'meta', 'config.yaml'),
      'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 4000\n  top_k: 10\nsearch:\n  use_tags: true\n  use_summary: false\nreview:\n  enabled: false\n',
      'utf-8'
    );
    await expect(
      capture({ auto: true, repo: path.join(tmpDir, '.memobank'), silent: true })
    ).resolves.not.toThrow();
  });
});

describe('appendToSessionLog', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-log-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true });
  });

  it('creates meta/sessions.md with a session entry', () => {
    appendToSessionLog(tmpDir, {
      date: '2026-05-26',
      branch: 'feat/my-feature',
      lastCommit: 'abc1234 add something',
      extractedNames: ['my-lesson', 'my-decision'],
      gitStatus: 'M src/foo.ts',
    });

    const content = fsSync.readFileSync(path.join(tmpDir, 'meta', 'sessions.md'), 'utf-8');
    expect(content).toContain('<!-- memobank session log -->');
    expect(content).toContain('2026-05-26');
    expect(content).toContain('feat/my-feature');
    expect(content).toContain('`my-lesson`');
    expect(content).toContain('`my-decision`');
  });

  it('prepends new entries (newest first)', () => {
    appendToSessionLog(tmpDir, {
      date: '2026-05-25',
      branch: 'main',
      lastCommit: 'aaa0001 first',
      extractedNames: ['old-lesson'],
      gitStatus: '',
    });
    appendToSessionLog(tmpDir, {
      date: '2026-05-26',
      branch: 'feat/new',
      lastCommit: 'bbb0002 second',
      extractedNames: ['new-lesson'],
      gitStatus: '',
    });

    const content = fsSync.readFileSync(path.join(tmpDir, 'meta', 'sessions.md'), 'utf-8');
    expect(content.indexOf('2026-05-26')).toBeLessThan(content.indexOf('2026-05-25'));
  });

  it('skips write when all fields are empty', () => {
    appendToSessionLog(tmpDir, {
      date: '2026-05-26',
      branch: '',
      lastCommit: '',
      extractedNames: [],
      gitStatus: '',
    });

    expect(fsSync.existsSync(path.join(tmpDir, 'meta', 'sessions.md'))).toBe(false);
  });

  it('keeps at most 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      appendToSessionLog(tmpDir, {
        date: '2026-05-26',
        branch: `branch-${i}`,
        lastCommit: 'x',
        extractedNames: [],
        gitStatus: 'M f.ts',
      });
    }

    const content = fsSync.readFileSync(path.join(tmpDir, 'meta', 'sessions.md'), 'utf-8');
    const entryCount = (content.match(/^## /gm) ?? []).length;
    expect(entryCount).toBe(100);
  });
});
