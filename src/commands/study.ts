import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import matter from 'gray-matter';
import { findRepoRoot } from '../core/store';

export interface StudyOptions {
  if?: string;
  list?: boolean;
  repo?: string;
  auto?: boolean;
  silent?: boolean;
}

export interface StudyAutoOptions {
  silent?: boolean;
}

export async function studyAutoCommand(repoRoot: string, options: StudyAutoOptions): Promise<void> {
  const { loadAccessLogs, saveAccessLogs } = await import('../core/lifecycle-manager');
  const logs = loadAccessLogs(repoRoot);
  const now = new Date();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const candidates: Array<{ name: string; access_count: number; suggested_at: string }> = [];

  const lessonFiles = findLessons(repoRoot);

  for (const filePath of lessonFiles) {
    const log = logs[filePath];
    if (!log) continue;
    if (log.accessCount < 3) continue;

    // Read frontmatter to check type and status
    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      continue;
    }
    const data = parsed.data as Record<string, unknown>;
    if (data.status === 'deprecated' || data.status === 'needs-review') continue;

    // 7-day cooldown
    if (log.last_study_suggested) {
      const daysSince = now.getTime() - new Date(log.last_study_suggested).getTime();
      if (daysSince < SEVEN_DAYS_MS) continue;
    }

    const lessonName = path.basename(filePath, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    candidates.push({
      name: lessonName,
      access_count: log.accessCount,
      suggested_at: now.toISOString(),
    });

    // Update last_study_suggested in access log
    log.last_study_suggested = now.toISOString();
  }

  if (candidates.length === 0) return;

  // Write suggestions file
  const metaDir = path.join(repoRoot, 'meta');
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }
  const suggestionsPath = path.join(metaDir, 'study-suggestions.json');
  fs.writeFileSync(suggestionsPath, JSON.stringify(candidates, null, 2), 'utf-8');

  // Flush updated access logs (synchronous — must complete before this fn returns)
  saveAccessLogs(repoRoot, logs);

  if (!options.silent) {
    for (const c of candidates) {
      process.stdout.write(`💡 memo study ${c.name} — recalled ${c.access_count} times\n`);
    }
  }
}

function findLessons(repoRoot: string): string[] {
  const dirs = ['lesson', 'decision', 'workflow', 'architecture'];
  const results: string[] = [];
  for (const dir of dirs) {
    const dirPath = path.join(repoRoot, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const file of fs.readdirSync(dirPath)) {
      if (file.endsWith('.md')) results.push(path.join(dirPath, file));
    }
  }
  return results;
}

function findLesson(repoRoot: string, name: string): string | null {
  const files = findLessons(repoRoot);
  const exact = files.find((f) => path.basename(f, '.md') === name);
  if (exact) return exact;
  return files.find((f) => path.basename(f, '.md').includes(name)) ?? null;
}

function findClaudeMd(repoRoot: string): string {
  // repoRoot is the .memobank/ dir — CLAUDE.md lives in the git root (one level up)
  const gitRoot = path.dirname(repoRoot);
  return path.join(gitRoot, 'CLAUDE.md');
}

function extractSummary(content: string): string {
  const lines = content.split('\n').filter((l) => l.trim() !== '');
  return lines.slice(0, 4).join('\n');
}

function buildBlock(
  condition: string,
  lessonPath: string,
  repoRoot: string,
  summary: string
): string {
  const relPath = path.relative(path.dirname(repoRoot), lessonPath);
  return `\n<important if="${condition}">\n<!-- source: ${relPath} -->\n${summary.trim()}\n</important>\n`;
}

async function promptCondition(lessonName: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      `Condition for "${lessonName}" (e.g. "you are installing dependencies"): `,
      (answer) => {
        rl.close();
        resolve(answer.trim());
      }
    );
  });
}

export async function studyCommand(
  lessonName: string | undefined,
  options: StudyOptions
): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);

  if (options.auto) {
    await studyAutoCommand(repoRoot, { silent: options.silent });
    return;
  }

  if (options.list || !lessonName) {
    const files = findLessons(repoRoot);
    if (files.length === 0) {
      console.log('No lessons found in .memobank/');
      return;
    }
    console.log('Available lessons:');
    for (const f of files) {
      const rel = path.relative(repoRoot, f);
      const parsed = matter(fs.readFileSync(f, 'utf-8'));
      console.log(`  ${path.basename(f, '.md')}  —  ${parsed.data.description ?? rel}`);
    }
    return;
  }

  const lessonPath = findLesson(repoRoot, lessonName);
  if (!lessonPath) {
    throw new Error(
      `Lesson not found: "${lessonName}". Run memo study --list to see available lessons.`
    );
  }

  const parsed = matter(fs.readFileSync(lessonPath, 'utf-8'));
  const summary = extractSummary(parsed.content);

  const claudeMdPath = findClaudeMd(repoRoot);
  const existing = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf-8') : '';

  const relPath = path.relative(path.dirname(repoRoot), lessonPath);
  if (existing.includes(`<!-- source: ${relPath} -->`)) {
    console.warn(`⚠  Already studied: "${lessonName}" is already in CLAUDE.md`);
    return;
  }

  const condition = options.if ?? (await promptCondition(lessonName));
  if (!condition) {
    throw new Error('Condition is required. Use --if="..." or enter it interactively.');
  }

  const block = buildBlock(condition, lessonPath, repoRoot, summary);
  fs.appendFileSync(claudeMdPath, block, 'utf-8');
  console.log(`✓ Lesson "${lessonName}" studied → CLAUDE.md updated`);
}
