/**
 * Capture command
 * Extracts learnings from session text and writes to memory files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { extract } from '../core/smart-extractor';
import { sanitize } from '../core/sanitizer';
import { writeMemory, loadAll, findRepoRoot } from '../core/store';
import { loadConfig } from '../config';
import { MemoryFile } from '../types';

export interface CaptureOptions {
  session?: string;
  auto?: boolean;
  repo?: string;
}

/**
 * Hash a string for deduplication
 */
function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Check if a memory already exists (by name hash)
 */
function isDuplicate(name: string, existingMemories: MemoryFile[]): boolean {
  const hash = hashString(name);
  return existingMemories.some((m) => hashString(m.name) === hash);
}

export async function capture(options: CaptureOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const config = loadConfig(repoRoot);

  // 1. Get session text
  let sessionText = '';

  if (options.auto) {
    // Read from Claude auto-memory directory
    const claudeMemoryDir = path.join(
      process.env.HOME || '',
      '.claude',
      'projects',
      config.project.name,
      'memory'
    );
    if (fs.existsSync(claudeMemoryDir)) {
      const files = fs
        .readdirSync(claudeMemoryDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(claudeMemoryDir, f))
        .sort((a, b) => {
          const statA = fs.statSync(a);
          const statB = fs.statSync(b);
          return statB.mtimeMs - statA.mtimeMs;
        });

      if (files.length > 0 && files[0]) {
        sessionText = fs.readFileSync(files[0], 'utf-8');
        console.log(`Read from: ${files[0]}`);
      } else {
        console.log('No recent memory files found in Claude directory');
        return;
      }
    } else {
      console.log('Claude memory directory not found');
      return;
    }
  } else if (options.session) {
    // Read from provided session text or file
    if (options.session === '-') {
      // Read from stdin
      sessionText = await readStdin();
    } else if (fs.existsSync(options.session)) {
      sessionText = fs.readFileSync(options.session, 'utf-8');
    } else {
      sessionText = options.session;
    }
  } else {
    console.log('No session text provided. Use --session=<text> or --auto');
    return;
  }

  if (!sessionText.trim()) {
    console.log('Session text is empty');
    return;
  }

  // 2. Sanitize
  const sanitized = sanitize(sessionText);

  // 3. Extract memories via LLM
  const extracted = await extract(sanitized, process.env.ANTHROPIC_API_KEY);

  if (extracted.length === 0) {
    console.log('No memories extracted from session');
    return;
  }

  // 4. Load existing memories for deduplication
  const existingMemories = loadAll(repoRoot);

  // 5. Deduplicate and write
  let written = 0;
  for (const item of extracted) {
    if (isDuplicate(item.name, existingMemories)) {
      console.log(`Skipping duplicate: ${item.name}`);
      continue;
    }

    const memory = {
      name: item.name,
      type: item.type,
      description: item.description,
      tags: item.tags,
      confidence: item.confidence,
      content: item.content,
      created: new Date().toISOString(),
    };

    const filePath = writeMemory(repoRoot, memory);
    console.log(`Created: ${filePath}`);
    written++;
  }

  // 6. Print summary
  console.log(`\nCaptured ${written} memories`);

  // 7. Note: index update is no-op for text engine
  if (config.embedding.engine === 'lancedb') {
    console.log('Run: memo index --incremental to update LanceDB');
  }
}

/**
 * Read from stdin
 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}
