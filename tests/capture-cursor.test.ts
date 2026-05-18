import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readCursor, markSessionProcessed, isSessionProcessed } from '../src/core/capture-cursor';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-cursor-test-'));
}

describe('capture-cursor', () => {
  it('readCursor returns empty cursor when file does not exist', async () => {
    const metaDir = makeTempDir();
    try {
      const cursor = await readCursor(metaDir);
      expect(cursor.processedSessions).toEqual([]);
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });

  it('markSessionProcessed writes sessionId to cursor file', async () => {
    const metaDir = makeTempDir();
    try {
      const sessionId = 'sess-12345';
      await markSessionProcessed(metaDir, sessionId);
      const cursor = await readCursor(metaDir);
      expect(cursor.processedSessions).toContain(sessionId);
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });

  it('markSessionProcessed is idempotent (duplicate sessionId not added twice)', async () => {
    const metaDir = makeTempDir();
    try {
      const sessionId = 'sess-67890';
      await markSessionProcessed(metaDir, sessionId);
      await markSessionProcessed(metaDir, sessionId);
      const cursor = await readCursor(metaDir);
      const count = cursor.processedSessions.filter((s: string) => s === sessionId).length;
      expect(count).toBe(1);
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });

  it('markSessionProcessed trims to MAX_SESSIONS=100 (sliding window, keeps most recent)', async () => {
    const metaDir = makeTempDir();
    try {
      // Add 150 sessions
      for (let i = 0; i < 150; i++) {
        await markSessionProcessed(metaDir, `sess-${i}`);
      }
      const cursor = await readCursor(metaDir);
      expect(cursor.processedSessions.length).toBe(100);
      // Should keep the most recent (50-149), not the oldest (0-49)
      expect(cursor.processedSessions).toContain('sess-149');
      expect(cursor.processedSessions).not.toContain('sess-0');
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });
});
