import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';
import { runProcessQueue } from '../src/commands/process-queue';

jest.mock('child_process', () => ({
  ...jest.requireActual<typeof import('child_process')>('child_process'),
  spawn: jest.fn(),
}));

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-pqcmd-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test-project\n');
  return dir;
}

describe('runProcessQueue', () => {
  it('exits with code 0 when no pending files', async () => {
    const repo = makeTempRepo();
    await expect(runProcessQueue(repo, { background: false })).resolves.toBe(0);
    fs.rmSync(repo, { recursive: true });
  });

  it('exits with code 0 after processing pending files', async () => {
    const repo = makeTempRepo();
    const pendingDir = path.join(repo, '.pending');
    fs.mkdirSync(pendingDir);
    fs.writeFileSync(
      path.join(pendingDir, 'LRN-001.json'),
      JSON.stringify({
        id: 'LRN-001',
        timestamp: '2026-03-26T00:00:00.000Z',
        projectId: 'test-project',
        candidates: [
          {
            name: 'cmd-lesson',
            type: 'lesson',
            description: 'd',
            tags: [],
            confidence: 'high',
            content: 'body',
          },
        ],
      })
    );
    const code = await runProcessQueue(repo, { background: false });
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(repo, '.pending', 'LRN-001.json'))).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('background flag: spawns detached child and returns 0 immediately', async () => {
    const repo = makeTempRepo();
    const mockUnref = jest.fn();
    (childProcess.spawn as jest.Mock).mockReturnValue({ unref: mockUnref });

    const code = await runProcessQueue(repo, { background: true });

    expect(code).toBe(0);
    expect(childProcess.spawn).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining(['process-queue']),
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    );
    expect(mockUnref).toHaveBeenCalled();
    fs.rmSync(repo, { recursive: true });
  });
});
