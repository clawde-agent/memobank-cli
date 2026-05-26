import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  updateStatusOnRecall,
  runLifecycleScan,
  resetEpoch,
  loadAccessLogs,
  saveAccessLogs,
  pruneOrphanedAccessLogs,
  pruneDeprecatedMemories,
} from '../src/core/lifecycle-manager';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-lifecycle-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

function writeTestMemory(dir: string, type: string, filename: string, status: string): string {
  const typeDir = path.join(dir, type);
  fs.mkdirSync(typeDir, { recursive: true });
  const content = `---\nname: test-memory\ntype: ${type}\ndescription: A test\ntags: []\ncreated: "2026-01-01"\nstatus: ${status}\n---\n\nContent here.`;
  const filePath = path.join(typeDir, filename);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('updateStatusOnRecall', () => {
  it('promotes experimental → active on first recall', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-test.md', 'experimental');
    // Create access log entry first
    const logs = loadAccessLogs(repo);
    logs[filePath] = {
      memoryPath: filePath,
      lastAccessed: new Date(),
      accessCount: 1,
      recallQueries: [],
      epochAccessCount: 1,
      team_epoch: new Date().toISOString(),
    };
    saveAccessLogs(repo, logs);
    updateStatusOnRecall(repo, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('status: active');
    fs.rmSync(repo, { recursive: true });
  });

  it('promotes needs-review → active after 3 recalls in epoch', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-nr.md', 'needs-review');
    const logs = loadAccessLogs(repo);
    logs[filePath] = {
      memoryPath: filePath,
      lastAccessed: new Date(),
      accessCount: 3,
      recallQueries: [],
      epochAccessCount: 3,
      team_epoch: new Date().toISOString(),
    };
    saveAccessLogs(repo, logs);
    updateStatusOnRecall(repo, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('status: active');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('resetEpoch', () => {
  it('resets team_epoch and epochAccessCount to 0', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-epoch.md', 'active');
    const logs = loadAccessLogs(repo);
    logs[filePath] = {
      memoryPath: filePath,
      lastAccessed: new Date(),
      accessCount: 10,
      recallQueries: [],
      epochAccessCount: 10,
      team_epoch: '2025-01-01T00:00:00.000Z',
    };
    saveAccessLogs(repo, logs);
    resetEpoch(repo);
    const updatedLogs = loadAccessLogs(repo);
    expect(updatedLogs[filePath]?.epochAccessCount).toBe(0);
    expect(updatedLogs[filePath]?.team_epoch).not.toBe('2025-01-01T00:00:00.000Z');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('runLifecycleScan', () => {
  it('downgrades active → needs-review when inactive for 90+ days', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-old.md', 'active');
    const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    const logs = loadAccessLogs(repo);
    logs[filePath] = {
      memoryPath: filePath,
      lastAccessed: oldDate,
      accessCount: 5,
      recallQueries: [],
      epochAccessCount: 0,
      team_epoch: new Date().toISOString(),
    };
    saveAccessLogs(repo, logs);
    runLifecycleScan(repo);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('status: needs-review');
    fs.rmSync(repo, { recursive: true });
  });
});

describe('pruneOrphanedAccessLogs', () => {
  it('removes access log entries for files that no longer exist', () => {
    const repo = makeTempRepo();
    const existingPath = writeTestMemory(repo, 'lesson', '2026-01-01-existing.md', 'active');
    const ghostPath = path.join(repo, 'lesson', '2026-01-01-deleted.md');

    const logs = loadAccessLogs(repo);
    logs[existingPath] = {
      memoryPath: existingPath,
      lastAccessed: new Date(),
      accessCount: 1,
      recallQueries: [],
      epochAccessCount: 1,
      team_epoch: new Date().toISOString(),
    };
    logs[ghostPath] = {
      memoryPath: ghostPath,
      lastAccessed: new Date(),
      accessCount: 5,
      recallQueries: [],
      epochAccessCount: 5,
      team_epoch: new Date().toISOString(),
    };
    saveAccessLogs(repo, logs);

    pruneOrphanedAccessLogs(repo);

    const after = loadAccessLogs(repo);
    expect(Object.keys(after)).toContain(existingPath);
    expect(Object.keys(after)).not.toContain(ghostPath);

    fs.rmSync(repo, { recursive: true });
  });

  it('is a no-op when all access log entries are valid', () => {
    const repo = makeTempRepo();
    const filePath = writeTestMemory(repo, 'lesson', '2026-01-01-valid.md', 'active');
    const logs = loadAccessLogs(repo);
    logs[filePath] = {
      memoryPath: filePath,
      lastAccessed: new Date(),
      accessCount: 2,
      recallQueries: [],
      epochAccessCount: 2,
      team_epoch: new Date().toISOString(),
    };
    saveAccessLogs(repo, logs);

    pruneOrphanedAccessLogs(repo);

    const after = loadAccessLogs(repo);
    expect(Object.keys(after)).toHaveLength(1);
    fs.rmSync(repo, { recursive: true });
  });
});

describe('pruneDeprecatedMemories', () => {
  it('deletes all deprecated memories and returns the count', () => {
    const repo = makeTempRepo();
    const dep1 = writeTestMemory(repo, 'lesson', '2026-01-01-dep1.md', 'deprecated');
    const dep2 = writeTestMemory(repo, 'workflow', '2026-01-01-dep2.md', 'deprecated');
    writeTestMemory(repo, 'lesson', '2026-01-01-active.md', 'active');

    const count = pruneDeprecatedMemories(repo);

    expect(count).toBe(2);
    expect(fs.existsSync(dep1)).toBe(false);
    expect(fs.existsSync(dep2)).toBe(false);
    expect(fs.existsSync(path.join(repo, 'lesson', '2026-01-01-active.md'))).toBe(true);

    fs.rmSync(repo, { recursive: true });
  });

  it('cleans orphaned access log entries for deleted deprecated memories', () => {
    const repo = makeTempRepo();
    const dep = writeTestMemory(repo, 'lesson', '2026-01-01-dep.md', 'deprecated');
    const logs = loadAccessLogs(repo);
    logs[dep] = {
      memoryPath: dep,
      lastAccessed: new Date(),
      accessCount: 1,
      recallQueries: [],
      epochAccessCount: 1,
      team_epoch: new Date().toISOString(),
    };
    saveAccessLogs(repo, logs);

    pruneDeprecatedMemories(repo);

    const after = loadAccessLogs(repo);
    expect(Object.keys(after)).not.toContain(dep);

    fs.rmSync(repo, { recursive: true });
  });
});
