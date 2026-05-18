import { distillToWorkspace, distillToPersonal } from '../src/core/distiller';
import type { MemoryFile } from '../src/types';

function makeMemory(name: string, confidence: 'high' | 'medium' | 'low' = 'high'): MemoryFile {
  return {
    path: `/fake/${name}.md`,
    name,
    type: 'lesson',
    description: `desc of ${name}`,
    tags: ['test'],
    created: '2026-01-01',
    confidence,
    status: 'active',
    content: `## Problem\nWe had a bug.\n\n## Solution\nFixed it by doing X.`,
  };
}

describe('distillToWorkspace', () => {
  it('returns empty array when no API key', async () => {
    const result = await distillToWorkspace([makeMemory('jwt-bug')], undefined);
    expect(result).toEqual([]);
  });

  it('returns empty array when no memories', async () => {
    const result = await distillToWorkspace([], 'fake-key');
    expect(result).toEqual([]);
  });

  it('calls mock LLM and returns distilled memories', async () => {
    const memories = [makeMemory('jwt-bug'), makeMemory('db-timeout')];
    const mockLLM = async (_prompt: string): Promise<string> => {
      return JSON.stringify([
        {
          name: 'jwt-expiry-edge-case',
          type: 'lesson',
          description: 'JWT expiry handling in auth flows',
          tags: ['auth', 'jwt'],
          confidence: 'high',
          content: '## Lesson\nAlways validate JWT exp claim before decoding.',
          distilled_from: ['jwt-bug'],
        },
      ]);
    };
    const result = await distillToWorkspace(memories, 'fake-key', mockLLM);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('jwt-expiry-edge-case');
    expect(result[0]!.distilled_from).toEqual(['jwt-bug']);
  });
});

describe('distillToPersonal', () => {
  it('returns empty string when no API key', async () => {
    const result = await distillToPersonal([], undefined, undefined);
    expect(result).toBe('');
  });

  it('calls mock LLM and returns persona string', async () => {
    const memories = [makeMemory('jwt-bug'), makeMemory('rrf-search')];
    const mockLLM = async (_prompt: string): Promise<string> => {
      return 'The user prefers TypeScript and has deep expertise in authentication systems.';
    };
    const result = await distillToPersonal(memories, undefined, 'fake-key', mockLLM);
    expect(result).toContain('The user prefers');
  });

  it('passes existing persona to LLM prompt', async () => {
    const memories = [makeMemory('jwt-bug')];
    let capturedPrompt = '';
    const mockLLM = async (prompt: string): Promise<string> => {
      capturedPrompt = prompt;
      return 'The user prefers TypeScript.';
    };
    const existingPersona = 'The user is experienced with Node.js.';
    await distillToPersonal(memories, existingPersona, 'fake-key', mockLLM);
    expect(capturedPrompt).toContain(existingPersona);
  });
});
