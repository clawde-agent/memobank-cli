import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { processQueue } from '../src/core/queue-processor';
import { loadFile } from '../src/core/memory-loader';
import { deduplicate } from '../src/core/dedup';
jest.mock('../src/core/dedup');
const mockDeduplicate = deduplicate as jest.MockedFunction<typeof deduplicate>;

jest.mock('../src/engines/memory-graph', () => ({
  incrementalEdgeUpdate: jest.fn().mockResolvedValue(undefined),
  ensureGraphSchema: jest.fn(),
  buildMemoryGraph: jest.fn(),
  graphExpand: jest.fn().mockReturnValue([]),
}));
import { incrementalEdgeUpdate } from '../src/engines/memory-graph';
const mockIncremental = incrementalEdgeUpdate as jest.MockedFunction<typeof incrementalEdgeUpdate>;

// Default: use real deduplicate logic so existing tests continue to pass
beforeEach(() => {
  const actual = jest.requireActual<typeof import('../src/core/dedup')>('../src/core/dedup');
  mockDeduplicate.mockImplementation(actual.deduplicate);
});

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-pq-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  // project.name used by resolveProjectId as config fallback
  fs.writeFileSync(path.join(dir, 'meta', 'config.yaml'), 'project:\n  name: test-project\n');
  return dir;
}

function writePendingFile(repo: string, entry: object): void {
  const pendingDir = path.join(repo, '.pending');
  fs.mkdirSync(pendingDir, { recursive: true });
  const id = (entry as { id: string }).id;
  fs.writeFileSync(path.join(pendingDir, `${id}.json`), JSON.stringify(entry, null, 2));
}

describe('processQueue', () => {
  it('does nothing when .pending/ does not exist', async () => {
    const repo = makeTempRepo();
    await expect(processQueue(repo)).resolves.not.toThrow();
    fs.rmSync(repo, { recursive: true });
  });

  it('writes candidate to memory file and deletes pending file', async () => {
    const repo = makeTempRepo();
    writePendingFile(repo, {
      id: 'LRN-001',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'my-lesson',
          type: 'lesson',
          description: 'a lesson',
          tags: ['x'],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    await processQueue(repo);

    // Verify memory file was written
    const lessonDir = path.join(repo, 'lesson');
    expect(fs.existsSync(lessonDir)).toBe(true);
    const files = fs.readdirSync(lessonDir);
    expect(files.length).toBe(1);
    const memory = loadFile(path.join(lessonDir, files[0]!));
    expect(memory.name).toBe('my-lesson');
    expect(memory.project).toBe('test-project');

    // Verify pending file was deleted
    expect(fs.existsSync(path.join(repo, '.pending', 'LRN-001.json'))).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('skips duplicate (same name already exists)', async () => {
    const repo = makeTempRepo();
    // Write an existing memory
    fs.mkdirSync(path.join(repo, 'lesson'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'lesson', '2026-01-01-existing-lesson.md'),
      '---\nname: existing-lesson\ntype: lesson\ndescription: d\ntags: []\ncreated: "2026-01-01"\nstatus: active\n---\nbody'
    );
    writePendingFile(repo, {
      id: 'LRN-dup',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'existing-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    await processQueue(repo);

    // Only the original file should exist
    const files = fs.readdirSync(path.join(repo, 'lesson'));
    expect(files.length).toBe(1);
    expect(files[0]).toBe('2026-01-01-existing-lesson.md');
    fs.rmSync(repo, { recursive: true });
  });

  it('deletes pending file whose projectId does not match current project', async () => {
    const repo = makeTempRepo(); // project.name = "test-project"
    writePendingFile(repo, {
      id: 'LRN-foreign',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'other-org/other-repo',
      candidates: [
        {
          name: 'foreign-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await processQueue(repo);
    warnSpy.mockRestore();

    expect(fs.existsSync(path.join(repo, '.pending', 'LRN-foreign.json'))).toBe(false);
    expect(fs.existsSync(path.join(repo, 'lesson'))).toBe(false);
    fs.rmSync(repo, { recursive: true });
  });

  it('deletes and warns on corrupt pending file', async () => {
    const repo = makeTempRepo();
    const pendingDir = path.join(repo, '.pending');
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'corrupt.json'), '{not valid json');

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await processQueue(repo);
    expect(fs.existsSync(path.join(pendingDir, 'corrupt.json'))).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('corrupt'));
    warnSpy.mockRestore();
    fs.rmSync(repo, { recursive: true });
  });
});

describe('processQueue — dedup integration', () => {
  beforeEach(() => {
    mockDeduplicate.mockReset();
  });

  it('calls deduplicate() and writes only toWrite candidates', async () => {
    const repo = makeTempRepo();
    writePendingFile(repo, {
      id: 'LRN-dedup',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'keep-this',
          type: 'lesson',
          description: 'keep',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
        {
          name: 'skip-this',
          type: 'lesson',
          description: 'skip',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    mockDeduplicate.mockResolvedValue({
      toWrite: [
        {
          name: 'keep-this',
          type: 'lesson',
          description: 'keep',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
      toSkip: [
        {
          name: 'skip-this',
          type: 'lesson',
          description: 'skip',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    await processQueue(repo);

    const lessonDir = path.join(repo, 'lesson');
    const files = fs.readdirSync(lessonDir);
    expect(files.length).toBe(1);
    const memory = loadFile(path.join(lessonDir, files[0]!));
    expect(memory.name).toBe('keep-this');
    fs.rmSync(repo, { recursive: true });
  });

  it('second pending file sees memory written by first pending file (existing[] grows)', async () => {
    const repo = makeTempRepo();
    writePendingFile(repo, {
      id: 'LRN-first',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'shared-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });
    writePendingFile(repo, {
      id: 'LRN-second',
      timestamp: '2026-03-26T00:00:01.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'shared-lesson',
          type: 'lesson',
          description: 'd',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });

    mockDeduplicate
      .mockResolvedValueOnce({
        toWrite: [
          {
            name: 'shared-lesson',
            type: 'lesson',
            description: 'd',
            tags: [],
            confidence: 'high',
            content: 'body',
          },
        ],
        toSkip: [],
      })
      .mockResolvedValueOnce({
        toWrite: [],
        toSkip: [
          {
            name: 'shared-lesson',
            type: 'lesson',
            description: 'd',
            tags: [],
            confidence: 'high',
            content: 'body',
          },
        ],
      });

    await processQueue(repo);

    const lessonDir = path.join(repo, 'lesson');
    expect(fs.readdirSync(lessonDir).length).toBe(1);
    expect(mockDeduplicate).toHaveBeenCalledTimes(2);
    const secondCallExisting = mockDeduplicate.mock.calls[1]![1];
    expect(secondCallExisting.some((m: { name: string }) => m.name === 'shared-lesson')).toBe(true);
    fs.rmSync(repo, { recursive: true });
  });
});

describe('processQueue — graph integration', () => {
  beforeEach(() => mockIncremental.mockClear());

  it('calls incrementalEdgeUpdate after writing a memory when code-index.db exists', async () => {
    const repo = makeTempRepo();
    // Create fake code-index.db so the guard passes
    fs.mkdirSync(path.join(repo, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'meta', 'code-index.db'), '');
    writePendingFile(repo, {
      id: 'LRN-graph',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'graph-lesson',
          type: 'lesson',
          description: 'test',
          tags: ['test'],
          confidence: 'high',
          content: 'body',
        },
      ],
    });
    await processQueue(repo);
    expect(mockIncremental).toHaveBeenCalledTimes(1);
    const [, memInput] = mockIncremental.mock.calls[0]!;
    expect(memInput.id).toBe('graph-lesson');
    expect(memInput.content).toBe('body');
    expect(typeof memInput.content_hash).toBe('string');
    fs.rmSync(repo, { recursive: true });
  });

  it('skips incrementalEdgeUpdate when code-index.db absent', async () => {
    const repo = makeTempRepo();
    writePendingFile(repo, {
      id: 'LRN-nograph',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'no-graph-lesson',
          type: 'lesson',
          description: 'test',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });
    await processQueue(repo);
    expect(mockIncremental).not.toHaveBeenCalled();
    fs.rmSync(repo, { recursive: true });
  });

  it('does not fail processQueue when incrementalEdgeUpdate throws', async () => {
    const repo = makeTempRepo();
    fs.mkdirSync(path.join(repo, 'meta'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'meta', 'code-index.db'), '');
    mockIncremental.mockRejectedValueOnce(new Error('graph write failed'));
    writePendingFile(repo, {
      id: 'LRN-errtest',
      timestamp: '2026-03-26T00:00:00.000Z',
      projectId: 'test-project',
      candidates: [
        {
          name: 'err-lesson',
          type: 'lesson',
          description: 'test',
          tags: [],
          confidence: 'high',
          content: 'body',
        },
      ],
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(processQueue(repo)).resolves.toBeUndefined();
    warnSpy.mockRestore();
    fs.rmSync(repo, { recursive: true });
  });
});
