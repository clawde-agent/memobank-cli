import { clusterByTags, synthesizeScenes } from '../src/core/scene-synthesizer';
import type { MemoryFile } from '../src/types';

function makeMemory(name: string, tags: string[]): MemoryFile {
  return {
    path: `/fake/${name}.md`,
    name,
    type: 'lesson',
    description: `desc ${name}`,
    tags,
    created: '2026-01-01',
    content: `Content of ${name}`,
  };
}

describe('clusterByTags', () => {
  it('groups memories sharing tags into same cluster', () => {
    const memories = [
      makeMemory('jwt-bug', ['auth', 'jwt']),
      makeMemory('token-refresh', ['auth', 'jwt']),
      makeMemory('db-timeout', ['database', 'performance']),
    ];
    const clusters = clusterByTags(memories);
    expect(clusters.length).toBe(2);
    const authCluster = clusters.find((c) => c.some((m) => m.name === 'jwt-bug'));
    expect(authCluster?.map((m) => m.name)).toContain('token-refresh');
  });

  it('puts unrelated memories in separate clusters', () => {
    const memories = [makeMemory('jwt-bug', ['auth']), makeMemory('rrf-search', ['search'])];
    const clusters = clusterByTags(memories);
    expect(clusters.length).toBe(2);
  });

  it('returns single cluster for single memory', () => {
    const memories = [makeMemory('solo', ['unique'])];
    const clusters = clusterByTags(memories);
    expect(clusters).toHaveLength(1);
  });
});

describe('synthesizeScenes', () => {
  it('returns empty array when no API key', async () => {
    const memories = [makeMemory('jwt-bug', ['auth'])];
    const result = await synthesizeScenes(memories, '/tmp/.memobank', undefined);
    expect(result).toEqual([]);
  });

  it('calls mock LLM per cluster and returns scene results', async () => {
    const memories = [
      makeMemory('jwt-bug', ['auth', 'jwt']),
      makeMemory('token-refresh', ['auth', 'jwt']),
      makeMemory('db-timeout', ['database']),
    ];
    let callCount = 0;
    const mockLLM = async (_prompt: string): Promise<string> => {
      callCount++;
      return `# Scene ${callCount}\n\nNarrative content here.`;
    };
    const results = await synthesizeScenes(memories, '/tmp/.memobank', 'fake-key', mockLLM);
    expect(callCount).toBe(2); // 2 clusters
    expect(results).toHaveLength(2);
    expect(results[0]!.content).toContain('Narrative');
  });
});
