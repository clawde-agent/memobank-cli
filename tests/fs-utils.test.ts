import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readJsonFile, ensureDir } from '../src/core/fs-utils';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-utils-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('readJsonFile', () => {
  it('parses a valid JSON file and returns typed value', () => {
    const file = path.join(tmpDir, 'data.json');
    fs.writeFileSync(file, JSON.stringify({ count: 42 }));
    const result = readJsonFile<{ count: number }>(file, { count: 0 });
    expect(result.count).toBe(42);
  });

  it('returns fallback when file does not exist', () => {
    const result = readJsonFile<string[]>(path.join(tmpDir, 'missing.json'), []);
    expect(result).toEqual([]);
  });

  it('returns fallback when file contains invalid JSON', () => {
    const file = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(file, 'not json {{{');
    const result = readJsonFile<Record<string, unknown>>(file, {});
    expect(result).toEqual({});
  });

  it('returns null fallback correctly', () => {
    const result = readJsonFile<null>(path.join(tmpDir, 'missing.json'), null);
    expect(result).toBeNull();
  });
});

describe('ensureDir', () => {
  it('creates a directory that does not exist', () => {
    const dir = path.join(tmpDir, 'nested', 'sub');
    ensureDir(dir);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('does not throw when directory already exists', () => {
    ensureDir(tmpDir); // tmpDir already exists
    expect(fs.existsSync(tmpDir)).toBe(true);
  });
});
