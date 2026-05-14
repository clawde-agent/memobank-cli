import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getGlobalDir,
  getProjectDir,
  getWorkspaceDir,
  loadAll,
  loadFile,
  resolveProjectId,
  writePending,
  writeMemory,
} from '../src/core/store';
import { CodeIndex } from '../src/engines/code-index';

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
    const home = process.env.HOME || process.env.USERPROFILE || '';
    expect(getGlobalDir('my-project')).toBe(path.join(home, '.memobank', 'my-project'));
  });
});

describe('getProjectDir', () => {
  it('returns .memobank/ directly under repoRoot', () => {
    const tmpDir = path.join(os.tmpdir(), 'repo', 'root');
    expect(getProjectDir(tmpDir)).toBe(tmpDir);
  });
});

describe('getWorkspaceDir', () => {
  it('returns ~/.memobank/_workspace/<name> path', () => {
    const home = process.env.HOME || process.env.USERPROFILE || '';
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
    expect(memories.some((m) => m.scope === 'personal')).toBe(true);
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
    const lessons = memories.filter((m) => m.type === 'lesson');
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
      name: 'test',
      type: 'lesson',
      description: 'desc',
      tags: [],
      created: '2026-01-01',
      content: 'body',
      status: 'experimental',
    });
    const files = fs.readdirSync(path.join(repo, 'lesson'));
    expect(files.length).toBe(1);
    const written = fs.readFileSync(path.join(repo, 'lesson', files[0]!), 'utf-8');
    expect(written).toContain('status: experimental');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('writeMemory / loadFile — project field', () => {
  it('round-trips project field through frontmatter', () => {
    const repo = makeTempRepo();
    writeMemory(repo, {
      name: 'proj-test',
      type: 'lesson',
      description: 'desc',
      tags: [],
      confidence: 'high',
      status: 'active',
      content: 'body',
      created: '2026-03-26T00:00:00.000Z',
      project: 'org/my-repo',
    });
    const files = fs.readdirSync(path.join(repo, 'lesson'));
    const memory = loadFile(path.join(repo, 'lesson', files[0]!));
    expect(memory.project).toBe('org/my-repo');
    fs.rmSync(repo, { recursive: true });
  });

  it('loadFile returns undefined project when field is absent', () => {
    const repo = makeTempRepo();
    writeTestMemory(repo, 'lesson', '2026-01-01-no-project.md');
    const memory = loadFile(path.join(repo, 'lesson', '2026-01-01-no-project.md'));
    expect(memory.project).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });
});

describe('resolveProjectId', () => {
  it('falls back to config.project.name when no git remote', () => {
    const repo = makeTempRepo(); // config.yaml: project.name = "test"
    const projectId = resolveProjectId(repo);
    expect(projectId).toBe('test');
    fs.rmSync(repo, { recursive: true });
  });

  it('falls back to dirname when no git remote and no config name', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-pid-'));
    fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  description: no name\n');
    const projectId = resolveProjectId(dir);
    expect(projectId).toBe(path.basename(path.dirname(dir)));
    fs.rmSync(dir, { recursive: true });
  });

  it('parses HTTPS git remote URL', () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-gitparent-'));
    const memoBankDir = path.join(parentDir, '.memobank');
    fs.mkdirSync(path.join(memoBankDir, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(memoBankDir, 'meta', 'config.yaml'), 'project:\n  name: fallback\n');
    execSync('git init', { cwd: parentDir, stdio: 'pipe' });
    execSync('git remote add origin https://github.com/myorg/myrepo.git', {
      cwd: parentDir,
      stdio: 'pipe',
    });
    const projectId = resolveProjectId(memoBankDir);
    expect(projectId).toBe('myorg/myrepo');
    fs.rmSync(parentDir, { recursive: true });
  });
});

describe('writePending', () => {
  it('creates .pending/<id>.json with correct content', () => {
    const repo = makeTempRepo();
    const entry = {
      id: 'LRN-test-001',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'org/repo',
      candidates: [
        {
          name: 'test-lesson',
          type: 'lesson' as const,
          description: 'desc',
          tags: ['a'],
          confidence: 'high' as const,
          content: 'body',
        },
      ],
    };
    writePending(repo, entry);
    const filePath = path.join(repo, '.pending', 'LRN-test-001.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as typeof entry;
    expect(parsed.projectId).toBe('org/repo');
    expect(parsed.candidates[0]!.name).toBe('test-lesson');
    fs.rmSync(repo, { recursive: true });
  });

  it('creates .pending/ directory if it does not exist', () => {
    const repo = makeTempRepo();
    expect(fs.existsSync(path.join(repo, '.pending'))).toBe(false);
    writePending(repo, {
      id: 'LRN-mkdir-test',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'org/repo',
      candidates: [],
    });
    expect(fs.existsSync(path.join(repo, '.pending'))).toBe(true);
    fs.rmSync(repo, { recursive: true });
  });
});

describe('writeMemory → linkMemory integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-store-graph-'));
    // Create the meta/ dir and a code index with a known symbol
    fs.mkdirSync(path.join(tmpDir, 'meta'), { recursive: true });
    const dbPath = path.join(tmpDir, 'meta', 'code-index.db');
    const idx = new CodeIndex(dbPath);
    idx.upsertFile('src/auth.ts', 'typescript', 'h1', Date.now());
    idx.upsertSymbols(
      'src/auth.ts',
      [
        {
          name: 'verifyToken',
          qualifiedName: 'verifyToken',
          kind: 'function' as const,
          file: 'src/auth.ts',
          lineStart: 1,
          lineEnd: 10,
          isExported: true,
          hash: 'hash-vt',
        },
      ],
      []
    );
    idx.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('populates memory_symbol_refs after writeMemory', () => {
    writeMemory(tmpDir, {
      name: 'jwt-lesson',
      type: 'lesson',
      description: 'verifyToken raises on expired JWT',
      tags: ['auth'],
      confidence: 'high',
      status: 'active',
      created: '2026-01-01',
      content: 'Some content.',
    });
    const dbPath = path.join(tmpDir, 'meta', 'code-index.db');
    const idx = new CodeIndex(dbPath);
    const rows = (idx as any).db.prepare('SELECT * FROM memory_symbol_refs').all() as {
      memory_path: string;
      symbol_hash: string;
    }[];
    idx.close();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].symbol_hash).toBe('hash-vt');
  });
});
