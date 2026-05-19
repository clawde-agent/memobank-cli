import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  readSceneIndex,
  writeSceneIndex,
  updateSceneHeat,
  type SceneEntry,
} from '../src/core/scene-index';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scene-index-'));
}

describe('scene-index', () => {
  it('readSceneIndex returns empty array when file missing', async () => {
    const dir = makeTmpDir();
    const index = await readSceneIndex(dir);
    expect(index).toEqual([]);
  });

  it('writeSceneIndex persists entries and readSceneIndex loads them', async () => {
    const dir = makeTmpDir();
    const entries: SceneEntry[] = [
      {
        filename: 'auth.md',
        summary: 'Auth refactor',
        heat: 0,
        created: '2026-01-01',
        updated: '2026-01-01',
      },
    ];
    await writeSceneIndex(dir, entries);
    const loaded = await readSceneIndex(dir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.filename).toBe('auth.md');
  });

  it('updateSceneHeat increments heat for existing entry', async () => {
    const dir = makeTmpDir();
    const entries: SceneEntry[] = [
      {
        filename: 'auth.md',
        summary: 'Auth',
        heat: 5,
        created: '2026-01-01',
        updated: '2026-01-01',
      },
    ];
    await writeSceneIndex(dir, entries);
    await updateSceneHeat(dir, 'auth.md');
    const loaded = await readSceneIndex(dir);
    expect(loaded[0]!.heat).toBe(6);
  });

  it('updateSceneHeat is a no-op for unknown filename', async () => {
    const dir = makeTmpDir();
    await writeSceneIndex(dir, []);
    await updateSceneHeat(dir, 'nonexistent.md');
    const loaded = await readSceneIndex(dir);
    expect(loaded).toHaveLength(0);
  });
});
