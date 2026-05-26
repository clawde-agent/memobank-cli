import * as fs from 'fs';
import * as path from 'path';

const LOG_HEADER = '<!-- memobank session log -->';
const SEPARATOR = '\n\n---\n\n';
const MAX_ENTRIES = 100;

export interface SessionLogEntry {
  date: string;
  branch: string;
  lastCommit: string;
  extractedNames: string[];
  gitStatus: string;
}

function buildEntryBlock(entry: SessionLogEntry): string {
  const { date, branch, lastCommit, extractedNames, gitStatus } = entry;
  const commitShort = lastCommit ? lastCommit.slice(0, 40) : '';
  const parts = [date, branch, commitShort].filter(Boolean);
  const lines: string[] = [`## ${parts.join(' · ')}`, ''];

  if (extractedNames.length > 0) {
    lines.push(`Memories: ${extractedNames.map((n) => `\`${n}\``).join(', ')}`);
  } else {
    lines.push('No memories extracted.');
  }

  if (gitStatus) {
    const files = gitStatus
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `\`${l.slice(3)}\``)
      .slice(0, 10);
    if (files.length > 0) {
      lines.push('', `Changed: ${files.join(', ')}`);
    }
  }

  return lines.join('\n');
}

export function appendToSessionLog(repoRoot: string, entry: SessionLogEntry): void {
  if (!entry.branch && entry.extractedNames.length === 0 && !entry.gitStatus) return;

  const logDir = path.join(repoRoot, 'meta');
  fs.mkdirSync(logDir, { recursive: true });

  const logPath = path.join(logDir, 'sessions.md');

  // Migrate from old location (.memobank/workflow/sessions.md) on first write
  const oldPath = path.join(repoRoot, 'workflow', 'sessions.md');
  if (fs.existsSync(oldPath) && !fs.existsSync(logPath)) {
    try {
      fs.renameSync(oldPath, logPath);
    } catch {
      /* non-fatal: old file stays, new one will be created */
    }
  }
  const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : '';

  let entries: string[] = [];
  if (existing.startsWith(LOG_HEADER)) {
    const body = existing.slice(LOG_HEADER.length).trimStart();
    entries = body.split(SEPARATOR).filter((s) => s.trim());
  }

  entries = [buildEntryBlock(entry), ...entries].slice(0, MAX_ENTRIES);

  fs.writeFileSync(logPath, LOG_HEADER + '\n\n' + entries.join(SEPARATOR) + '\n', 'utf-8');
}
