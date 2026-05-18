import * as fs from 'fs/promises';
import * as path from 'path';

export interface CaptureCursor {
  processedSessions: string[];
}

const MAX_SESSIONS = 100;

export async function readCursor(metaDir: string): Promise<CaptureCursor> {
  const cursorPath = path.join(metaDir, 'capture-cursor.json');
  try {
    const raw = await fs.readFile(cursorPath, 'utf-8');
    return JSON.parse(raw) as CaptureCursor;
  } catch {
    return { processedSessions: [] };
  }
}

export async function markSessionProcessed(metaDir: string, sessionId: string): Promise<void> {
  const cursorPath = path.join(metaDir, 'capture-cursor.json');
  const cursor = await readCursor(metaDir);
  if (cursor.processedSessions.includes(sessionId)) return;
  cursor.processedSessions.push(sessionId);
  if (cursor.processedSessions.length > MAX_SESSIONS) {
    cursor.processedSessions = cursor.processedSessions.slice(-MAX_SESSIONS);
  }
  await fs.mkdir(path.dirname(cursorPath), { recursive: true });
  await fs.writeFile(cursorPath, JSON.stringify(cursor, null, 2), 'utf-8');
}

export async function isSessionProcessed(metaDir: string, sessionId: string): Promise<boolean> {
  const cursor = await readCursor(metaDir);
  return cursor.processedSessions.includes(sessionId);
}
