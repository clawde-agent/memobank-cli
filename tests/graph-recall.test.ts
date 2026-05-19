import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { recallCommand } from '../src/commands/recall';

jest.mock('../src/core/retriever', () => ({
  recall: jest.fn().mockResolvedValue({
    results: [],
    markdown: '## Recalled Memory\n\n*No memories*',
    symbolResults: [],
  }),
  writeRecallResults: jest.fn(),
}));

jest.mock('../src/engines/memory-graph', () => ({
  graphExpand: jest.fn().mockReturnValue([]),
  ensureGraphSchema: jest.fn(),
  buildMemoryGraph: jest.fn(),
  incrementalEdgeUpdate: jest.fn(),
}));

jest.mock('../src/engines/code-index', () => ({
  CodeIndex: {
    getDbPath: jest.fn((root: string) => path.join(root, 'meta', 'code-index.db')),
    isAvailable: jest.fn().mockReturnValue(false),
  },
}));

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-recall-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 10000\n  top_k: 5\nsearch:\n  use_tags: true\n  use_summary: true\nreview:\n  enabled: false\n'
  );
  return dir;
}

describe('recallCommand — dual-track regression (no code-index.db)', () => {
  it('completes without error when code-index.db absent', async () => {
    const repo = makeTempRepo();
    await expect(recallCommand('test query', { repo, silent: true })).resolves.toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });
});

describe('recallCommand — recall-misses tracking', () => {
  it('appends to recall-misses.json when results are empty', async () => {
    const repo = makeTempRepo();
    await recallCommand('empty query', { repo, silent: true });
    const missesPath = path.join(repo, 'meta', 'recall-misses.json');
    expect(fs.existsSync(missesPath)).toBe(true);
    const misses = JSON.parse(fs.readFileSync(missesPath, 'utf-8'));
    expect(misses).toHaveLength(1);
    expect(misses[0].query).toBe('empty query');
    expect(misses[0].result_count).toBe(0);
    fs.rmSync(repo, { recursive: true });
  });
});

describe('recallCommand — study hint', () => {
  it('does not throw when study-suggestions.json is absent', async () => {
    const repo = makeTempRepo();
    await expect(recallCommand('hint test', { repo, silent: true })).resolves.toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('does not throw when study-suggestions.json is corrupt', async () => {
    const repo = makeTempRepo();
    fs.writeFileSync(path.join(repo, 'meta', 'study-suggestions.json'), '{not json}');
    await expect(recallCommand('hint test', { repo, silent: true })).resolves.toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });
});
