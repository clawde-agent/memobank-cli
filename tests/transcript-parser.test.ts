import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  parseTranscriptFile,
  deriveProjectId,
  findUnprocessedSessions,
  writeL0,
} from '../src/core/transcript-parser';

async function writeTmpTranscript(lines: object[]): Promise<string> {
  const dir = path.join(os.tmpdir(), `transcript-test-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'session.jsonl');
  await fs.writeFile(file, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf-8');
  return file;
}

describe('deriveProjectId', () => {
  it('converts absolute path to Claude Code project ID', () => {
    expect(deriveProjectId('/Users/foo/myproject')).toBe('-Users-foo-myproject');
  });
});

describe('parseTranscriptFile', () => {
  it('extracts user and assistant text turns', async () => {
    const file = await writeTmpTranscript([
      { type: 'attachment', sessionId: 's1' },
      {
        type: 'user',
        sessionId: 's1',
        uuid: 'u1',
        timestamp: '2026-01-01T00:00:00Z',
        message: { content: 'how do I fix this bug?' },
      },
      {
        type: 'assistant',
        sessionId: 's1',
        uuid: 'u2',
        timestamp: '2026-01-01T00:00:01Z',
        message: { content: [{ type: 'text', text: 'The root cause is X.' }] },
      },
    ]);
    const turns = await parseTranscriptFile(file);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ role: 'user', text: 'how do I fix this bug?' });
    expect(turns[1]).toMatchObject({ role: 'assistant', text: 'The root cause is X.' });
  });

  it('skips isMeta user turns (skill injections)', async () => {
    const file = await writeTmpTranscript([
      {
        type: 'user',
        isMeta: true,
        sessionId: 's1',
        uuid: 'u1',
        timestamp: '2026-01-01T00:00:00Z',
        message: { content: 'Base directory for this skill: ...' },
      },
      {
        type: 'user',
        sessionId: 's1',
        uuid: 'u2',
        timestamp: '2026-01-01T00:00:01Z',
        message: { content: 'real user message here' },
      },
    ]);
    const turns = await parseTranscriptFile(file);
    expect(turns).toHaveLength(1);
    expect(turns[0]?.text).toBe('real user message here');
  });

  it('skips tool_result user turns', async () => {
    const file = await writeTmpTranscript([
      {
        type: 'user',
        toolUseResult: true,
        sessionId: 's1',
        uuid: 'u1',
        timestamp: '2026-01-01T00:00:00Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'result' }] },
      },
    ]);
    const turns = await parseTranscriptFile(file);
    expect(turns).toHaveLength(0);
  });

  it('strips code blocks from assistant turns', async () => {
    const file = await writeTmpTranscript([
      {
        type: 'assistant',
        sessionId: 's1',
        uuid: 'u1',
        timestamp: '2026-01-01T00:00:00Z',
        message: {
          content: [
            {
              type: 'text',
              text: 'The fix is:\n```ts\nconst x = 1;\n```\nThis works because of Y.',
            },
          ],
        },
      },
    ]);
    const turns = await parseTranscriptFile(file);
    expect(turns[0]?.text).not.toContain('const x = 1');
    expect(turns[0]?.text).toContain('This works because of Y.');
  });

  it('skips turns shorter than 10 chars', async () => {
    const file = await writeTmpTranscript([
      {
        type: 'user',
        sessionId: 's1',
        uuid: 'u1',
        timestamp: '2026-01-01T00:00:00Z',
        message: { content: 'ok' },
      },
    ]);
    const turns = await parseTranscriptFile(file);
    expect(turns).toHaveLength(0);
  });
});

describe('writeL0', () => {
  it('writes turns as JSONL to l0 directory', async () => {
    const dir = path.join(os.tmpdir(), `l0-test-${Date.now()}`);
    const turns = [
      { role: 'user' as const, text: 'hello world', ts: '2026-01-01T00:00:00Z' },
      { role: 'assistant' as const, text: 'hi there', ts: '2026-01-01T00:00:01Z' },
    ];
    await writeL0(dir, 'session-abc', turns);
    const written = await fs.readFile(path.join(dir, 'session-abc.jsonl'), 'utf-8');
    const lines = written
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ role: 'user', text: 'hello world' });
  });
});
