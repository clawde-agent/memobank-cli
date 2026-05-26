import * as fs from 'fs/promises';
import * as path from 'path';

export interface CaptureCursor {
  processed: Record<string, string>; // sessionId → ISO timestamp
}

const RETENTION_DAYS = 180;

function pruneExpired(processed: Record<string, string>): Record<string, string> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const result: Record<string, string> = {};
  for (const [id, ts] of Object.entries(processed)) {
    if (new Date(ts).getTime() >= cutoff) {
      result[id] = ts;
    }
  }
  return result;
}

export async function readCursor(metaDir: string): Promise<CaptureCursor> {
  const cursorPath = path.join(metaDir, 'capture-cursor.json');
  try {
    const raw = await fs.readFile(cursorPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Migrate old format: { processedSessions: string[] }
    if (Array.isArray(parsed['processedSessions'])) {
      const now = new Date().toISOString();
      const processed: Record<string, string> = {};
      for (const id of parsed['processedSessions'] as string[]) {
        processed[id] = now;
      }
      return { processed };
    }

    if (parsed['processed'] && typeof parsed['processed'] === 'object') {
      return { processed: parsed['processed'] as Record<string, string> };
    }

    return { processed: {} };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return { processed: {} };
  }
}

export async function markSessionProcessed(metaDir: string, sessionId: string): Promise<void> {
  const cursorPath = path.join(metaDir, 'capture-cursor.json');
  const cursor = await readCursor(metaDir);
  cursor.processed[sessionId] = new Date().toISOString();
  const pruned = pruneExpired(cursor.processed);
  await fs.mkdir(path.dirname(cursorPath), { recursive: true });
  await fs.writeFile(cursorPath, JSON.stringify({ processed: pruned }, null, 2), 'utf-8');
}

export async function isSessionProcessed(metaDir: string, sessionId: string): Promise<boolean> {
  const cursor = await readCursor(metaDir);
  return sessionId in cursor.processed;
}
