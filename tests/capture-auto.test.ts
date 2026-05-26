import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { capture } from '../src/commands/capture';

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

describe('capture --auto session snapshot', () => {
  it('generateSessionSummary returns a valid PendingEntry with correct fields', async () => {
    const { generateSessionSummary } = await import('../src/commands/capture');
    const tmpRepo = path.join(os.tmpdir(), `snap-test-${Date.now()}`);
    await fs.mkdir(path.join(tmpRepo, 'meta'), { recursive: true });
    await fs.writeFile(path.join(tmpRepo, 'meta', 'config.yaml'), 'project:\n  name: test\n');

    const entry = generateSessionSummary({
      branch: 'feat/my-feature',
      lastCommit: 'abc1234 add something',
      gitStatus: 'M src/foo.ts',
      extractedNames: ['my-lesson', 'my-decision'],
      repoRoot: tmpRepo,
    });

    expect(entry).not.toBeNull();
    expect(entry!.candidates[0].type).toBe('workflow');
    expect(entry!.candidates[0].name).toMatch(/^session-\d{4}-\d{2}-\d{2}-feat-my-feature$/);
    expect(entry!.candidates[0].tags).toContain('session');
    expect(entry!.candidates[0].content).toContain('feat/my-feature');
    expect(entry!.candidates[0].content).toContain('my-lesson');
    await fs.rm(tmpRepo, { recursive: true });
  });

  it('returns null when branch, gitStatus, and extractedNames are all empty', async () => {
    const { generateSessionSummary } = await import('../src/commands/capture');
    const result = generateSessionSummary({
      branch: '',
      lastCommit: '',
      gitStatus: '',
      extractedNames: [],
      repoRoot: os.tmpdir(),
    });
    expect(result).toBeNull();
  });
});
