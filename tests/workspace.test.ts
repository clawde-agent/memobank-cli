import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('workspacePublish — project boundary', () => {
  it('rejects file whose project frontmatter does not match current project', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo(); // config.yaml: project.name = "test"
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-boundary-'));
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-foreign.md');
    fs.writeFileSync(
      srcFile,
      '---\nname: foreign\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\nproject: other-org/other-repo\n---\nbody'
    );
    await expect(workspacePublish(srcFile, repo, wsDir)).rejects.toThrow(
      'Project boundary violation'
    );
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });

  it('allows publish when project frontmatter matches current project', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo(); // config.yaml: project.name = "test"
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-match-'));
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-match.md');
    fs.writeFileSync(
      srcFile,
      '---\nname: match\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\nproject: test\n---\nbody'
    );
    await expect(workspacePublish(srcFile, repo, wsDir)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });

  it('allows publish when project frontmatter is absent (legacy files)', async () => {
    const { workspacePublish } = await import('../src/commands/workspace');
    const repo = makeTempRepo();
    const wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-ws-legacy-'));
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const srcFile = path.join(repo, 'lesson', '2026-01-01-legacy.md');
    fs.writeFileSync(
      srcFile,
      '---\nname: legacy\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\nbody'
    );
    await expect(workspacePublish(srcFile, repo, wsDir)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });
});

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
    fs.writeFileSync(
      srcFile,
      '---\nname: test\ntype: lesson\ndescription: desc\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\n\nContent'
    );
    await workspacePublish(srcFile, repo, wsDir);
    expect(fs.existsSync(path.join(wsDir, 'lesson', '2026-01-01-test.md'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(wsDir, { recursive: true });
  });
});
