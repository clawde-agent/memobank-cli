import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { distillCommand } from '../src/commands/distill';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-distill-'));
  fs.mkdirSync(path.join(dir, '.memobank', 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.memobank', 'meta', 'config.yaml'),
    'project:\n  name: test-project\nmemory:\n  token_budget: 4000\n  top_k: 10\nembedding:\n  engine: text\nsearch:\n  use_tags: true\n  use_summary: false\nreview:\n  enabled: false\n'
  );
  return path.join(dir, '.memobank');
}

describe('distillCommand', () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTempRepo();
  });

  afterEach(() => {
    const parent = path.dirname(dir);
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it('exits cleanly with no memories to distill (--to workspace)', async () => {
    await expect(distillCommand({ to: 'workspace', repo: dir })).resolves.not.toThrow();
  });

  it('exits cleanly with no memories to distill (--to personal)', async () => {
    await expect(distillCommand({ to: 'personal', repo: dir })).resolves.not.toThrow();
  });

  it('exits cleanly with no API key configured', async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(distillCommand({ to: 'workspace', repo: dir })).resolves.not.toThrow();
    } finally {
      if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig;
    }
  });
});
