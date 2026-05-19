import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { studyAutoCommand } from '../src/commands/study';

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-study-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    'project:\n  name: test\nembedding:\n  engine: text\nmemory:\n  token_budget: 10000\n  top_k: 5\nsearch:\n  use_tags: true\n  use_summary: true\nreview:\n  enabled: false\n'
  );
  return dir;
}

function writeLesson(repo: string, name: string): void {
  const dir = path.join(repo, 'lesson');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `2026-01-01-${name}.md`),
    `---\nname: ${name}\ntype: lesson\ndescription: desc\ntags: []\nstatus: active\ncreated: "2026-01-01"\n---\nbody`
  );
}

function writeAccessLog(
  repo: string,
  name: string,
  accessCount: number,
  lastStudySuggested?: string
): void {
  const filePath = path.join(repo, 'lesson', `2026-01-01-${name}.md`);
  const logs: Record<string, unknown> = {
    [filePath]: {
      memoryPath: filePath,
      lastAccessed: new Date().toISOString(),
      accessCount,
      recallQueries: [],
      epochAccessCount: accessCount,
      team_epoch: '2026-01-01T00:00:00.000Z',
      ...(lastStudySuggested ? { last_study_suggested: lastStudySuggested } : {}),
    },
  };
  fs.writeFileSync(path.join(repo, 'meta', 'access-log.json'), JSON.stringify(logs, null, 2));
}

describe('studyAutoCommand', () => {
  it('writes study-suggestions.json for lessons with access_count >= 3', async () => {
    const repo = makeTempRepo();
    writeLesson(repo, 'hot-lesson');
    writeAccessLog(repo, 'hot-lesson', 5);
    await studyAutoCommand(repo, { silent: true });
    const suggestionsPath = path.join(repo, 'meta', 'study-suggestions.json');
    expect(fs.existsSync(suggestionsPath)).toBe(true);
    const suggestions = JSON.parse(fs.readFileSync(suggestionsPath, 'utf-8'));
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].name).toBe('hot-lesson');
    expect(suggestions[0].access_count).toBe(5);
    fs.rmSync(repo, { recursive: true });
  });

  it('skips lessons with access_count < 3', async () => {
    const repo = makeTempRepo();
    writeLesson(repo, 'cold-lesson');
    writeAccessLog(repo, 'cold-lesson', 2);
    await studyAutoCommand(repo, { silent: true });
    const suggestionsPath = path.join(repo, 'meta', 'study-suggestions.json');
    const suggestions = fs.existsSync(suggestionsPath)
      ? JSON.parse(fs.readFileSync(suggestionsPath, 'utf-8'))
      : [];
    expect(suggestions.find((s: { name: string }) => s.name === 'cold-lesson')).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('respects 7-day cooldown (skips recently suggested)', async () => {
    const repo = makeTempRepo();
    writeLesson(repo, 'recent-lesson');
    const recentDate = new Date(Date.now() - 2 * 86400 * 1000).toISOString(); // 2 days ago
    writeAccessLog(repo, 'recent-lesson', 5, recentDate);
    await studyAutoCommand(repo, { silent: true });
    const suggestionsPath = path.join(repo, 'meta', 'study-suggestions.json');
    const suggestions = fs.existsSync(suggestionsPath)
      ? JSON.parse(fs.readFileSync(suggestionsPath, 'utf-8'))
      : [];
    expect(suggestions.find((s: { name: string }) => s.name === 'recent-lesson')).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('includes lessons whose last_study_suggested is > 7 days ago', async () => {
    const repo = makeTempRepo();
    writeLesson(repo, 'old-suggested');
    const oldDate = new Date(Date.now() - 10 * 86400 * 1000).toISOString(); // 10 days ago
    writeAccessLog(repo, 'old-suggested', 4, oldDate);
    await studyAutoCommand(repo, { silent: true });
    const suggestionsPath = path.join(repo, 'meta', 'study-suggestions.json');
    const suggestions = JSON.parse(fs.readFileSync(suggestionsPath, 'utf-8'));
    expect(suggestions.find((s: { name: string }) => s.name === 'old-suggested')).toBeDefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('updates last_study_suggested in access log after writing suggestions', async () => {
    const repo = makeTempRepo();
    writeLesson(repo, 'update-log-lesson');
    writeAccessLog(repo, 'update-log-lesson', 4);
    await studyAutoCommand(repo, { silent: true });
    const logs = JSON.parse(fs.readFileSync(path.join(repo, 'meta', 'access-log.json'), 'utf-8'));
    const lessonPath = path.join(repo, 'lesson', '2026-01-01-update-log-lesson.md');
    expect(logs[lessonPath]?.last_study_suggested).toBeDefined();
    fs.rmSync(repo, { recursive: true });
  });
});
