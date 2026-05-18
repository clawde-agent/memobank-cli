import * as fs from 'fs/promises';
import * as path from 'path';

export interface SceneEntry {
  filename: string;
  summary: string;
  heat: number;
  created: string;
  updated: string;
}

const INDEX_PATH = '.metadata/scene_index.json';

export async function readSceneIndex(memoDir: string): Promise<SceneEntry[]> {
  const indexPath = path.join(memoDir, INDEX_PATH);
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(raw) as SceneEntry[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return [];
  }
}

export async function writeSceneIndex(memoDir: string, entries: SceneEntry[]): Promise<void> {
  const indexPath = path.join(memoDir, INDEX_PATH);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function updateSceneHeat(memoDir: string, filename: string): Promise<void> {
  const entries = await readSceneIndex(memoDir);
  const entry = entries.find((e) => e.filename === filename);
  if (!entry) return;
  entry.heat += 1;
  entry.updated = new Date().toISOString().slice(0, 10);
  await writeSceneIndex(memoDir, entries);
}
