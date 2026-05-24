import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  ts: string;
}

export function deriveProjectId(absoluteCwd: string): string {
  // Replace all path separators (/ \) and Windows drive colon (:) with dashes
  // to match Claude Code's project folder naming: D:\Repo\foo → D--Repo-foo
  return absoluteCwd.replace(/[/\\:]/g, '-');
}

export function getTranscriptDir(cwd: string): string {
  return path.join(os.homedir(), '.claude', 'projects', deriveProjectId(cwd));
}

function stripCodeBlocks(text: string): string {
  return text
    .replace(/```[^\n]*\n[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter(
        (c): c is { type: string; text?: string } =>
          c?.type === 'text' && typeof c.text === 'string'
      )
      .map((c) => c.text!)
      .join('\n')
      .trim();
  }
  return '';
}

export async function parseTranscriptFile(transcriptFile: string): Promise<Turn[]> {
  const turns: Turn[] = [];
  const rl = createInterface({ input: createReadStream(transcriptFile), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const type = obj['type'];
    if (type !== 'user' && type !== 'assistant') continue;
    if (obj['isMeta'] === true) continue;
    if (obj['toolUseResult'] === true) continue;

    const message = obj['message'] as Record<string, unknown> | undefined;
    const content = message?.['content'];
    let text = extractText(content);

    if (type === 'assistant') text = stripCodeBlocks(text);
    if (text.length < 10) continue;

    turns.push({
      role: type as 'user' | 'assistant',
      text,
      ts: (obj['timestamp'] as string) ?? new Date().toISOString(),
    });
  }

  return turns;
}

export async function findUnprocessedSessions(
  cwd: string,
  processedIds: string[]
): Promise<Array<{ sessionId: string; file: string }>> {
  const transcriptDir = getTranscriptDir(cwd);
  try {
    const entries = await fs.readdir(transcriptDir);
    return entries
      .filter((e) => e.endsWith('.jsonl'))
      .map((e) => ({ sessionId: e.replace('.jsonl', ''), file: path.join(transcriptDir, e) }))
      .filter(({ sessionId }) => !processedIds.includes(sessionId));
  } catch {
    return [];
  }
}

export async function writeL0(l0Dir: string, sessionId: string, turns: Turn[]): Promise<void> {
  await fs.mkdir(l0Dir, { recursive: true });
  const l0File = path.join(l0Dir, `${sessionId}.jsonl`);
  const lines = turns.map((t) => JSON.stringify({ role: t.role, text: t.text, ts: t.ts }));
  await fs.writeFile(l0File, lines.join('\n') + '\n', 'utf-8');
}
