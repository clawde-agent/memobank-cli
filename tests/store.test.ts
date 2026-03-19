import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getPersonalDir,
  getTeamDir,
  loadAll,
  writeMemory,
  migrateToPersonal,
} from '../src/core/store';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-test-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

function writeTestMemory(dir: string, type: string, filename: string): void {
  fs.mkdirSync(path.join(dir, type), { recursive: true });
  const content = `---\nname: test-memory\ntype: ${type}\ndescription: A test\ntags: []\ncreated: "2026-01-01"\n---\n\nContent here.`;
  fs.writeFileSync(path.join(dir, type, filename), content);
}

describe('getPersonalDir', () => {
  it('returns personal/ path under repoRoot', () => {
    expect(getPersonalDir('/home/user/.memobank/proj')).toBe(
      '/home/user/.memobank/proj/personal'
    );
  });
});

describe('getTeamDir', () => {
  it('returns team/ path under repoRoot', () => {
    expect(getTeamDir('/home/user/.memobank/proj')).toBe(
      '/home/user/.memobank/proj/team'
    );
  });
});

describe('loadAll', () => {
  it('falls back to root-level loading when personal/ does not exist', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('loads from personal/ when it exists, labels scope=personal', () => {
    const repo = makeTempRepo();
    const personalDir = path.join(repo, 'personal');
    writeTestMemory(personalDir, 'lesson', '2026-01-01-personal.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('personal');
    fs.rmSync(repo, { recursive: true });
  });

  it('loads from team/ when it exists, labels scope=team', () => {
    const repo = makeTempRepo();
    const teamDir = path.join(repo, 'team');
    writeTestMemory(teamDir, 'lesson', '2026-01-01-team.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('team');
    fs.rmSync(repo, { recursive: true });
  });

  it('loads from both personal/ and team/ when both exist', () => {
    const repo = makeTempRepo();
    writeTestMemory(path.join(repo, 'personal'), 'lesson', '2026-01-01-p.md');
    writeTestMemory(path.join(repo, 'team'), 'lesson', '2026-01-01-t.md');
    const memories = loadAll(repo);
    expect(memories.length).toBe(2);
    expect(memories.map(m => m.scope).sort()).toEqual(['personal', 'team']);
    fs.rmSync(repo, { recursive: true });
  });

  it('respects scope=personal filter', () => {
    const repo = makeTempRepo();
    writeTestMemory(path.join(repo, 'personal'), 'lesson', '2026-01-01-p.md');
    writeTestMemory(path.join(repo, 'team'), 'lesson', '2026-01-01-t.md');
    const memories = loadAll(repo, 'personal');
    expect(memories.length).toBe(1);
    expect(memories[0].scope).toBe('personal');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('writeMemory', () => {
  it('writes to personal/ when personal/ exists', () => {
    const repo = makeTempRepo();
    fs.mkdirSync(path.join(repo, 'personal'), { recursive: true });
    const filePath = writeMemory(repo, {
      name: 'test-lesson',
      type: 'lesson',
      description: 'A test lesson',
      tags: [],
      created: '2026-01-01',
      content: 'Content',
    });
    expect(filePath).toContain('personal');
    fs.rmSync(repo, { recursive: true });
  });

  it('writes to root level when personal/ does not exist (legacy)', () => {
    const repo = makeTempRepo();
    const filePath = writeMemory(repo, {
      name: 'test-lesson',
      type: 'lesson',
      description: 'A test lesson',
      tags: [],
      created: '2026-01-01',
      content: 'Content',
    });
    expect(filePath).not.toContain('personal');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('migrateToPersonal', () => {
  it('moves root-level memories to personal/', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    const result = migrateToPersonal(repo);
    expect(result.migrated.length).toBe(1);
    expect(result.skipped.length).toBe(0);
    expect(fs.existsSync(path.join(repo, 'personal', 'lesson', '2026-01-01-test.md'))).toBe(true);
    expect(fs.existsSync(path.join(repo, 'lesson', '2026-01-01-test.md'))).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('skips files that already exist in personal/', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-test.md');
    writeTestMemory(path.join(repo, 'personal'), 'lesson', '2026-01-01-test.md');
    const result = migrateToPersonal(repo);
    expect(result.migrated.length).toBe(0);
    expect(result.skipped.length).toBe(1);
    fs.rmSync(repo, { recursive: true });
  });
});
