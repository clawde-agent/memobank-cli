import * as fs from 'fs';
import * as path from 'path';
import { findRepoRoot, resolveProjectId } from '../core/dir-resolver';
import { sanitize } from '../core/sanitizer';
import { writePending } from '../core/store';
import type { MemoryType } from '../types';

export interface RememberOptions {
  name: string;
  description: string;
  content: string;
  type?: string;
  tags?: string;
  codeRefs?: string;
  repo?: string;
}

const DEBOUNCE_WINDOW_MS = 60_000;

function hasPendingWithName(pendingDir: string, name: string): boolean {
  if (!fs.existsSync(pendingDir)) return false;
  const now = Date.now();
  for (const file of fs.readdirSync(pendingDir).filter((f) => f.endsWith('.json'))) {
    try {
      const raw = fs.readFileSync(path.join(pendingDir, file), 'utf-8');
      const entry = JSON.parse(raw) as {
        timestamp: string;
        candidates: Array<{ name: string }>;
      };
      const age = now - new Date(entry.timestamp).getTime();
      if (age < DEBOUNCE_WINDOW_MS && entry.candidates.some((c) => c.name === name)) {
        return true;
      }
    } catch {
      // corrupt file — skip
    }
  }
  return false;
}

export async function remember(options: RememberOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const pendingDir = path.join(repoRoot, '.pending');

  if (hasPendingWithName(pendingDir, options.name)) {
    return;
  }

  const tags = options.tags
    ? options.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const codeRefs = options.codeRefs
    ? options.codeRefs
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : undefined;

  const sanitizedContent = sanitize(options.content);

  writePending(repoRoot, {
    id: `REM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    projectId: resolveProjectId(repoRoot),
    candidates: [
      {
        name: options.name,
        type: (options.type ?? 'lesson') as MemoryType,
        description: options.description,
        tags,
        confidence: 'high',
        content: sanitizedContent,
        ...(codeRefs ? { codeRefs } : {}),
      },
    ],
  });

  // Background drain — non-blocking; Stop hook will drain if this fails
  try {
    const { spawn } = await import('child_process');
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '..', '..', 'dist', 'cli.js'), 'process-queue', '--background'],
      { detached: true, stdio: 'ignore' }
    );
    child.unref();
  } catch {
    // not fatal
  }
}
