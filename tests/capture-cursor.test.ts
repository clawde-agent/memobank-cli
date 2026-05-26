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
      expect(cursor.processed).toEqual({});
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
      expect(sessionId in cursor.processed).toBe(true);
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
      const count = Object.keys(cursor.processed).filter((s) => s === sessionId).length;
      expect(count).toBe(1);
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });

  it('migrates old processedSessions array format to new processed map', async () => {
    const metaDir = makeTempDir();
    try {
      const cursorPath = path.join(metaDir, 'capture-cursor.json');
      // Write old format
      fs.writeFileSync(cursorPath, JSON.stringify({ processedSessions: ['sess-1', 'sess-2'] }));
      const cursor = await readCursor(metaDir);
      expect(cursor.processed['sess-1']).toBeDefined();
      expect(cursor.processed['sess-2']).toBeDefined();
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });

  it('prunes sessions older than 180 days on write', async () => {
    const metaDir = makeTempDir();
    try {
      const cursorPath = path.join(metaDir, 'capture-cursor.json');
      const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
      fs.mkdirSync(metaDir, { recursive: true });
      fs.writeFileSync(cursorPath, JSON.stringify({ processed: { 'old-sess': oldDate } }));
      // Writing a new session triggers prune
      await markSessionProcessed(metaDir, 'new-sess');
      const cursor = await readCursor(metaDir);
      expect('old-sess' in cursor.processed).toBe(false);
      expect('new-sess' in cursor.processed).toBe(true);
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });

  it('isSessionProcessed returns false for unknown session', async () => {
    const metaDir = makeTempDir();
    try {
      const result = await isSessionProcessed(metaDir, 'unknown');
      expect(result).toBe(false);
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });

  it('readCursor rethrows non-ENOENT errors', async () => {
    const metaDir = makeTempDir();
    try {
      const cursorPath = path.join(metaDir, 'capture-cursor.json');
      fs.mkdirSync(cursorPath, { recursive: true });
      await expect(readCursor(metaDir)).rejects.toThrow();
    } finally {
      fs.rmSync(metaDir, { recursive: true });
    }
  });
});
