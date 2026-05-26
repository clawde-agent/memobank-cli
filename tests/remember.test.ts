import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-remember-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 4000\n  top_k: 10\n'
  );
  return dir;
}

describe('memo remember', () => {
  it('writes a pending entry to .pending/', async () => {
    const { remember } = await import('../src/commands/remember');
    const repo = makeTempRepo();
    await remember({
      name: 'test-lesson',
      description: 'A test lesson',
      content: '## Problem\nSomething happened.',
      type: 'lesson',
      tags: 'test,unit',
      repo,
    });
    const pendingDir = path.join(repo, '.pending');
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
    const entry = JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
    expect(entry.candidates[0].name).toBe('test-lesson');
    expect(entry.candidates[0].type).toBe('lesson');
    fs.rmSync(repo, { recursive: true });
  });

  it('skips write if same name exists in .pending/ within 60 seconds', async () => {
    const { remember } = await import('../src/commands/remember');
    const repo = makeTempRepo();
    await remember({ name: 'dupe', description: 'First', content: 'body', repo });
    await remember({ name: 'dupe', description: 'Second', content: 'body2', repo });
    const files = fs.readdirSync(path.join(repo, '.pending')).filter((f) => f.endsWith('.json'));
    expect(files.length).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });

  it('sanitizes secrets before writing', async () => {
    const { remember } = await import('../src/commands/remember');
    const repo = makeTempRepo();
    await remember({
      name: 'secret-test',
      description: 'Contains secret',
      content: 'My key is sk-abcdefghijklmnopqrstuvwxyz123456',
      repo,
    });
    const pendingDir = path.join(repo, '.pending');
    const files = fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'));
    const entry = JSON.parse(fs.readFileSync(path.join(pendingDir, files[0]), 'utf-8'));
    expect(entry.candidates[0].content).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    fs.rmSync(repo, { recursive: true });
  });
});
