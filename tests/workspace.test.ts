import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('workspacePublish', () => {
  it('aborts when source file does not exist', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo();
    await expect(workspacePublish('/nonexistent/file.md', repo)).rejects.toThrow('not found');
    fs.rmSync(repo, { recursive: true });
  });

  it('copies file to workspace dir when workspace dir exists', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo();
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-'));
    fs.mkdirSync(path.join(wsDir, 'lesson'), { recursive: true });
    // Create source file in repo/lesson/
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-test.md');
    fs.writeFileSync(srcFile, '---\nname: test\ntype: lesson\ndescription: desc\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\n\nContent');
    await workspacePublish(srcFile, repo, wsDir);
    expect(fs.existsSync(path.join(wsDir, 'lesson', '2026-01-01-test.md'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });
});
