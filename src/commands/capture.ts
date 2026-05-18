/**
 * Capture command
 * Extracts learnings from session text and writes to memory files
 * Uses noise filtering and value scoring to determine what's worth remembering
 */

import * as fs from 'fs';
import * as path from 'path';
import { extract } from '../core/smart-extractor';
import { sanitize } from '../core/sanitizer';
import { findRepoRoot, resolveProjectId, writePending } from '../core/store';
import { processQueue } from '../core/queue-processor';
import { loadConfig } from '../config';
import type { PendingEntry } from '../core/store';
import { calculateValueScore, getCaptureRecommendation } from '../core/noise-filter';

export interface CaptureOptions {
  session?: string;
  auto?: boolean;
  repo?: string;
  silent?: boolean;
}

export async function capture(options: CaptureOptions = {}): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd, options.repo);
  const config = loadConfig(repoRoot);

  // Silent mode for hooks
  const isSilent = options.silent || process.env.SILENT === '1';

  const log = (...args: unknown[]): void => {
    if (!isSilent) {
      console.log(...args);
    }
  };
  const error = (...args: unknown[]): void => {
    if (!isSilent) {
      console.error(...args);
    }
  };

  // 1. Get session text
  let sessionText = '';

  if (options.auto) {
    const { readCursor, markSessionProcessed } = await import('../core/capture-cursor');
    const { findUnprocessedSessions, parseTranscriptFile, writeL0 } =
      await import('../core/transcript-parser');

    const metaDir = path.join(repoRoot, 'meta');
    const cursor = await readCursor(metaDir);
    const unprocessed = await findUnprocessedSessions(cwd, cursor.processedSessions);

    if (unprocessed.length === 0) {
      log('No new sessions to capture');
      return;
    }

    const l0Dir = path.join(repoRoot, 'l0');

    for (const { sessionId, file } of unprocessed) {
      log(`Processing session ${sessionId}...`);
      const turns = await parseTranscriptFile(file);

      if (turns.length === 0) {
        await markSessionProcessed(metaDir, sessionId);
        continue;
      }

      // Write L0 archive (fire-and-forget)
      writeL0(l0Dir, sessionId, turns).catch(() => {
        /* silent */
      });

      sessionText = turns
        .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`)
        .join('\n\n');

      const sanitized = sanitize(sessionText);
      const extracted = await extract(sanitized, process.env.ANTHROPIC_API_KEY);

      if (extracted.length === 0) {
        log(`No memories extracted from session ${sessionId}`);
        await markSessionProcessed(metaDir, sessionId);
        continue;
      }

      const { dedupLLMBatch } = await import('../core/dedup');
      const { loadAll } = await import('../core/store');
      const existingMemories = loadAll(repoRoot, 'project');

      const candidates = extracted.map((item) => ({
        name: item.name,
        type: item.type,
        description: item.description,
        tags: item.tags,
        confidence: item.confidence,
        content: item.content,
      }));

      const { toWrite, toSkip, toUpdate } = await dedupLLMBatch(candidates, existingMemories);

      log(
        `Session ${sessionId}: ${toWrite.length} new, ${toSkip.length} skipped, ${toUpdate.length} updates`
      );

      if (toWrite.length > 0) {
        const entry: PendingEntry = {
          id: `LRN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          projectId: resolveProjectId(repoRoot),
          candidates: toWrite,
        };
        writePending(repoRoot, entry);
      }

      for (const { targetName, updatedContent } of toUpdate) {
        if (!updatedContent) continue;
        const { updateMemoryContent } = await import('../core/store');
        updateMemoryContent(repoRoot, targetName, updatedContent);
      }

      await markSessionProcessed(metaDir, sessionId);
    }

    await processQueue(repoRoot);
    return;
  } else if (options.session) {
    // Read from provided session text or file
    if (options.session === '-') {
      // Read from stdin
      try {
        sessionText = await readStdin();
      } catch (err) {
        error(`Failed to read from stdin: ${(err as Error).message}`);
        return;
      }
    } else if (fs.existsSync(options.session)) {
      sessionText = fs.readFileSync(options.session, 'utf-8');
    } else {
      sessionText = options.session;
    }
  } else {
    error('No session text provided. Use --session=<text> or --auto');
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

  console.log(`\n📊 Extracted ${extracted.length} potential memories, evaluating value...\n`);

  // 4. Evaluate and filter by value
  const memoriesWithValue = extracted.map((item) => ({
    ...item,
    valueScore: calculateValueScore(item.content),
    recommendation: getCaptureRecommendation(calculateValueScore(item.content)),
  }));

  // Display evaluation
  memoriesWithValue.forEach((item, i) => {
    const { valueScore, recommendation } = item;
    const icon = valueScore >= 0.7 ? '✅' : valueScore >= 0.5 ? '⚠️' : '❌';
    console.log(`${icon} [${i + 1}] ${item.name}`);
    console.log(`   Score: ${valueScore.toFixed(2)} | ${recommendation.reason}`);
    console.log(`   Confidence: ${recommendation.confidence}\n`);
  });

  // Filter out low-value memories
  const highValueMemories = memoriesWithValue.filter(
    (item) => item.valueScore >= 0.5 || item.recommendation.shouldCapture
  );

  if (highValueMemories.length === 0) {
    console.log('⊘ All memories filtered out due to low value.');
    return;
  }

  console.log(`✓ ${highValueMemories.length} memories passed value filter\n`);

  // 5. Write to pending queue, then process immediately
  const entry: PendingEntry = {
    id: `LRN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    projectId: resolveProjectId(repoRoot),
    candidates: highValueMemories.map((item) => ({
      name: item.name,
      type: item.type,
      description: item.description,
      tags: item.tags,
      confidence: item.confidence,
      content: item.content,
    })),
  };

  writePending(repoRoot, entry);
  await processQueue(repoRoot);

  // 6. Print summary
  console.log(`\n📝 Captured up to ${highValueMemories.length} high-value memories`);
  console.log(`   (duplicates skipped silently)\n`);

  // Note: index update is no-op for text engine
  if (config.embedding.engine === 'lancedb') {
    console.log('Run: memo index --incremental to update LanceDB');
  }
}

/**
 * Read from stdin with timeout
 */
function readStdin(timeoutMs: number = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const timeoutId = setTimeout(() => {
      reject(new Error('Stdin read timeout after 30 seconds'));
    }, timeoutMs);

    process.stdin.on('data', (chunk: Buffer | string) => {
      data += typeof chunk === 'string' ? chunk : chunk.toString();
    });
    process.stdin.on('end', () => {
      clearTimeout(timeoutId);
      resolve(data);
    });
    process.stdin.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}
