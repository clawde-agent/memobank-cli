import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getGlobalDir,
  getProjectDir,
  getWorkspaceDir,
  loadAll,
  writeMemory,
} from '../src/core/store';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

function writeTestMemory(dir: string, type: string, filename: string): void {
  fs.mkdirSync(path.join(dir, type), { recursive: true });
  const content = `---\nname: test-memory\ntype: ${type}\ndescription: A test\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\n\nContent here.`;
  fs.writeFileSync(path.join(dir, type, filename), content);
}

describe('getGlobalDir', () => {
  it('returns ~/.memobank/<project> path', () => {
    const home = process.env.HOME || '';
    expect(getGlobalDir('my-project')).toBe(path.join(home, '.memobank', 'my-project'));
  });
});

describe('getProjectDir', () => {
  it('returns .memobank/ directly under repoRoot', () => {
    expect(getProjectDir('/repo/root')).toBe('/repo/root');
  });
});

describe('getWorkspaceDir', () => {
  it('returns ~/.memobank/_workspace/<name> path', () => {
    const home = process.env.HOME || '';
    expect(getWorkspaceDir('myorg')).toBe(path.join(home, '.memobank', '_workspace', 'myorg'));
  });
});

describe('loadAll — three-tier', () => {
  it('loads project-tier memories from repoRoot directly', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('project');
    fs.rmSync(repo, { recursive: true });
  });

  it('loads global-tier memories from separate globalDir', () => {
    const repo = makeTempRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    writeTestMemory(globalDir, 'lesson', '2026-01-01-global.md');
    const memories = loadAll(repo, 'all', globalDir);
    expect(memories.some(m => m.scope === 'personal')).toBe(true);
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });

  it('project scope deduplicates same filename from global', () => {
    const repo = makeTempRepo();
    const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-global-'));
    const sameFile = '2026-01-01-test.md';
    writeTestMemory(repo, 'lesson', sameFile);
    writeTestMemory(globalDir, 'lesson', sameFile);
    const memories = loadAll(repo, 'all', globalDir);
    const lessons = memories.filter(m => m.type === 'lesson');
    expect(lessons.length).toBe(1);
    expect(lessons[0].scope).toBe('project');
    fs.rmSync(repo, { recursive: true });
    fs.rmSync(globalDir, { recursive: true });
  });

  it('legacy fallback: loads from root when no tier dirs exist', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-legacy.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });
});

describe('writeMemory', () => {
  it('writes status: experimental when status provided', () => {
    const repo = makeTempRepo();
    writeMemory(repo, {
      name: 'test', type: 'lesson', description: 'desc', tags: [],
      created: '2026-01-01', content: 'body', status: 'experimental',
    });
    const files = fs.readdirSync(path.join(repo, 'lesson'));
    expect(files.length).toBe(1);
    const written = fs.readFileSync(path.join(repo, 'lesson', files[0]!), 'utf-8');
    expect(written).toContain('status: experimental');
    fs.rmSync(repo, { recursive: true });
  });
});
