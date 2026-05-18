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
