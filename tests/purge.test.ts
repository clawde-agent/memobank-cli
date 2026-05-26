import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyPurgeFilters } from '../src/commands/purge';
import type { MemoryFile } from '../src/types';

function makeMemory(overrides: Partial<MemoryFile> = {}): MemoryFile {
  return {
    path: '/fake/lesson/2026-05-26-test.md',
    name: 'test-memory',
    type: 'lesson',
    description: 'A test memory',
    tags: ['api', 'test'],
    created: '2026-05-26T00:00:00.000Z',
    status: 'experimental',
    confidence: 'medium',
    content: '## Content',
    scope: 'project',
    ...overrides,
  };
}

describe('applyPurgeFilters', () => {
  const base: MemoryFile[] = [
    makeMemory({
      name: 'stripe-webhook',
      type: 'architecture',
      created: '2026-05-26T10:00:00Z',
      project: 'org/eval-harness',
      tags: ['stripe'],
    }),
    makeMemory({
      name: 'supabase-rls',
      type: 'architecture',
      created: '2026-05-26T11:00:00Z',
      project: 'org/eval-harness',
      tags: ['supabase'],
    }),
    makeMemory({
      name: 'real-lesson',
      type: 'lesson',
      created: '2026-05-27T09:00:00Z',
      project: 'org/memobank-cli',
      tags: ['core'],
    }),
    makeMemory({
      name: 'another-lesson',
      type: 'lesson',
      created: '2026-05-28T09:00:00Z',
      status: 'deprecated',
      tags: ['api'],
    }),
  ];

  it('filters by --before date', () => {
    const result = applyPurgeFilters(base, { before: '2026-05-27' });
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.name)).toContain('stripe-webhook');
    expect(result.map((m) => m.name)).toContain('supabase-rls');
  });

  it('filters by --after date', () => {
    // real-lesson is 2026-05-27T09:00Z and another-lesson is 2026-05-28T09:00Z;
    // both are strictly after 2026-05-27 (midnight UTC).
    const result = applyPurgeFilters(base, { after: '2026-05-27' });
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.name)).toContain('real-lesson');
    expect(result.map((m) => m.name)).toContain('another-lesson');
  });

  it('filters by --after with full datetime excludes exact midnight', () => {
    // Only another-lesson (2026-05-28) is after 2026-05-27T10:00Z
    const result = applyPurgeFilters(base, { after: '2026-05-27T10:00:00Z' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('another-lesson');
  });

  it('filters by --project', () => {
    const result = applyPurgeFilters(base, { project: 'org/eval-harness' });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.project === 'org/eval-harness')).toBe(true);
  });

  it('filters by --type', () => {
    const result = applyPurgeFilters(base, { type: 'lesson' });
    expect(result).toHaveLength(2);
    expect(result.every((m) => m.type === 'lesson')).toBe(true);
  });

  it('filters by --status', () => {
    const result = applyPurgeFilters(base, { status: 'deprecated' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('another-lesson');
  });

  it('filters by --tag', () => {
    const result = applyPurgeFilters(base, { tag: 'stripe' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('stripe-webhook');
  });

  it('filters by --name-pattern regex', () => {
    const result = applyPurgeFilters(base, { namePattern: '^supabase' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('supabase-rls');
  });

  it('combines multiple filters (AND logic)', () => {
    const result = applyPurgeFilters(base, {
      before: '2026-05-27',
      project: 'org/eval-harness',
      type: 'architecture',
    });
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no memories match', () => {
    const result = applyPurgeFilters(base, { project: 'org/nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('throws on invalid date', () => {
    expect(() => applyPurgeFilters(base, { before: 'not-a-date' })).toThrow('Invalid date');
  });

  it('throws on invalid type', () => {
    expect(() => applyPurgeFilters(base, { type: 'bogus' })).toThrow('Invalid type');
  });

  it('throws on invalid regex', () => {
    expect(() => applyPurgeFilters(base, { namePattern: '[invalid' })).toThrow('Invalid regex');
  });
});

describe('purgeCommand file deletion', () => {
  function makeMemoDir(): { dir: string; lessonDir: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-purge-test-'));
    const lessonDir = path.join(dir, 'lesson');
    fs.mkdirSync(lessonDir);
    // write meta/config.yaml so findRepoRoot resolves correctly
    const metaDir = path.join(dir, 'meta');
    fs.mkdirSync(metaDir);
    fs.writeFileSync(
      path.join(metaDir, 'config.yaml'),
      'project:\n  name: test-project\n',
      'utf-8'
    );
    return { dir, lessonDir };
  }

  function writeMemoryFile(dir: string, filename: string, frontmatter: string): string {
    const p = path.join(dir, filename);
    fs.writeFileSync(p, `---\n${frontmatter}\n---\n\n## Content\n`, 'utf-8');
    return p;
  }

  it('deletes matching files when --yes is set', () => {
    const { dir, lessonDir } = makeMemoDir();
    const f1 = writeMemoryFile(
      lessonDir,
      '2026-05-26-stripe.md',
      'name: stripe-hook\ntype: lesson\ndescription: test\ntags: []\ncreated: 2026-05-26'
    );
    const f2 = writeMemoryFile(
      lessonDir,
      '2026-05-27-real.md',
      'name: real-lesson\ntype: lesson\ndescription: real\ntags: []\ncreated: 2026-05-27'
    );

    const { purgeCommand } = require('../src/commands/purge');
    purgeCommand({ before: '2026-05-27', yes: true, repo: dir });

    expect(fs.existsSync(f1)).toBe(false);
    expect(fs.existsSync(f2)).toBe(true);

    fs.rmSync(dir, { recursive: true });
  });

  it('does not delete files in --dry-run mode', () => {
    const { dir, lessonDir } = makeMemoDir();
    const f1 = writeMemoryFile(
      lessonDir,
      '2026-05-26-old.md',
      'name: old-memory\ntype: lesson\ndescription: old\ntags: []\ncreated: 2026-05-26'
    );

    const { purgeCommand } = require('../src/commands/purge');
    purgeCommand({ before: '2026-05-27', dryRun: true, repo: dir });

    expect(fs.existsSync(f1)).toBe(true);

    fs.rmSync(dir, { recursive: true });
  });
});
