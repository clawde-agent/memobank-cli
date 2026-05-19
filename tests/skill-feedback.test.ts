import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { skillFeedbackCommand } from '../src/commands/skill-feedback';

jest.mock('../src/engines/code-index', () => ({
  CodeIndex: {
    getDbPath: jest.fn((root: string) => path.join(root, 'meta', 'code-index.db')),
    isAvailable: jest.fn().mockReturnValue(false),
  },
}));

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-sf-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 10000\n  top_k: 5\nsearch:\n  use_tags: true\n  use_summary: true\nreview:\n  enabled: false\n'
  );
  return dir;
}

describe('skillFeedbackCommand', () => {
  it('runs without error when no data files exist', async () => {
    const repo = makeTempRepo();
    await expect(skillFeedbackCommand(repo)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
  });

  it('reports recall miss count from recall-misses.json', async () => {
    const repo = makeTempRepo();
    fs.writeFileSync(
      path.join(repo, 'meta', 'recall-misses.json'),
      JSON.stringify([
        { query: 'auth bug', timestamp: '2026-01-01', result_count: 0 },
        { query: 'retry logic', timestamp: '2026-01-01', result_count: 0 },
      ])
    );
    const output: string[] = [];
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
      output.push(s as string);
      return true;
    });
    await skillFeedbackCommand(repo);
    writeSpy.mockRestore();
    expect(output.join('')).toContain('2');
    fs.rmSync(repo, { recursive: true });
  });

  it('gracefully handles absent recall-misses.json', async () => {
    const repo = makeTempRepo();
    await expect(skillFeedbackCommand(repo)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
  });

  it('reports memories with access_count = 0', async () => {
    const repo = makeTempRepo();
    // Write a memory file and an access log where it has 0 count
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    const filePath = path.join(repo, 'lesson', '2026-01-01-never-recalled.md');
    fs.writeFileSync(
      filePath,
      '---\nname: never-recalled\ntype: lesson\ndescription: d\ntags: []\nstatus: active\ncreated: "2026-01-01"\n---\nbody'
    );
    fs.writeFileSync(
      path.join(repo, 'meta', 'access-log.json'),
      JSON.stringify({
        [filePath]: {
          memoryPath: filePath,
          lastAccessed: new Date().toISOString(),
          accessCount: 0,
          recallQueries: [],
          epochAccessCount: 0,
          team_epoch: '2026-01-01',
        },
      })
    );
    const output: string[] = [];
    const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => {
      output.push(s as string);
      return true;
    });
    await skillFeedbackCommand(repo);
    writeSpy.mockRestore();
    expect(output.join('')).toContain('never-recalled');
    fs.rmSync(repo, { recursive: true });
  });
});
