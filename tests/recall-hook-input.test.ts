import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-hook-recall-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 4000\n  top_k: 5\n'
  );
  return dir;
}

function mockStdin(data: string): NodeJS.ReadStream {
  const original = process.stdin;
  Object.defineProperty(process, 'stdin', {
    value: Readable.from([data]),
    configurable: true,
  });
  return original;
}

function restoreStdin(original: NodeJS.ReadStream): void {
  Object.defineProperty(process, 'stdin', {
    value: original,
    configurable: true,
  });
}

describe('recallCommand --hook-input', () => {
  it('reads prompt from stdin JSON and runs recall silently', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    const repo = makeTempRepo();

    const hookPayload = JSON.stringify({
      hook_event_name: 'UserPromptSubmit',
      prompt: 'how does the pending queue work',
      session_id: 'test-123',
    });

    const original = mockStdin(hookPayload);
    try {
      await recallCommand('', { hookInput: true, silent: true, repo });
    } finally {
      restoreStdin(original);
    }
    fs.rmSync(repo, { recursive: true });
  });

  it('exits cleanly if stdin JSON has no prompt field', async () => {
    const { recallCommand } = await import('../src/commands/recall');
    const repo = makeTempRepo();
    const original = mockStdin(JSON.stringify({ session_id: 'x' }));
    try {
      await expect(
        recallCommand('', { hookInput: true, silent: true, repo })
      ).resolves.not.toThrow();
    } finally {
      restoreStdin(original);
    }
    fs.rmSync(repo, { recursive: true });
  });
});
