import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { writeMemory } from '../src/core/store';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-update-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('memo update', () => {
  it('updates the markdown body of an existing memory', async () => {
    const { updateMemoryCommand } = await import('../src/commands/update-memory');
    const repo = makeTempRepo();
    writeMemory(repo, {
      name: 'my-lesson',
      type: 'lesson',
      description: 'A lesson',
      tags: [],
      confidence: 'high',
      content: '## Original\nOld content.',
      created: new Date().toISOString(),
    });
    await updateMemoryCommand({ name: 'my-lesson', content: '## Updated\nNew content.', repo });
    const { loadAll } = await import('../src/core/memory-loader');
    const memories = loadAll(repo, 'project');
    const updated = memories.find((m) => m.name === 'my-lesson');
    expect(updated?.content).toContain('New content.');
    fs.rmSync(repo, { recursive: true });
  });

  it('throws a clear error if memory name not found', async () => {
    const { updateMemoryCommand } = await import('../src/commands/update-memory');
    const repo = makeTempRepo();
    await expect(
      updateMemoryCommand({ name: 'does-not-exist', content: 'body', repo })
    ).rejects.toThrow('Memory not found: does-not-exist');
    fs.rmSync(repo, { recursive: true });
  });
});
