/**
 * Capture command
 * Extracts learnings from session text and writes to memory files
 * Uses noise filtering and value scoring to determine what's worth remembering
 */

import * as path from 'path';
import { extract } from '../core/smart-extractor';
import { captureConfigFromMemoConfig, createCaptureProvider } from '../core/capture-provider';
import { sanitize } from '../core/sanitizer';
import { findRepoRoot, resolveProjectId } from '../core/dir-resolver';
import { writePending } from '../core/store';
import { processQueue } from '../core/queue-processor';
import { loadConfig } from '../config';
import type { PendingEntry } from '../core/store';
import { calculateValueScore, getCaptureRecommendation } from '../core/noise-filter';
import { readSessionText } from '../core/session-reader';

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
    const { findUnprocessedSessions, parseTranscriptFile } =
      await import('../core/transcript-parser');

    const metaDir = path.join(repoRoot, 'meta');
    const cursor = await readCursor(metaDir);
    const unprocessed = await findUnprocessedSessions(cwd, Object.keys(cursor.processed));

    if (unprocessed.length === 0) {
      log('No new sessions to capture');
      return;
    }

    // Clean up any l0/ archives left by older versions of memobank
    const { rm } = await import('fs/promises');
    rm(path.join(repoRoot, 'l0'), { recursive: true, force: true }).catch(() => {
      /* non-fatal */
    });

    for (const { sessionId, file } of unprocessed) {
      log(`Processing session ${sessionId}...`);
      const turns = await parseTranscriptFile(file);

      if (turns.length === 0) {
        await markSessionProcessed(metaDir, sessionId);
        continue;
      }

      sessionText = turns
        .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`)
        .join('\n\n');

      const sanitized = sanitize(sessionText);

      // Collect git working state (used both for LLM context and no-LLM fallback)
      let gitStatus = '';
      let gitBranch = '';
      let gitLastCommit = '';
      const projectLabel = config.project.description
        ? `${config.project.name} — ${config.project.description}`
        : config.project.name;
      let contextForExtraction = `[PROJECT: ${projectLabel}]\n\n${sanitized}`;
      try {
        const { execSync } = await import('child_process');
        gitStatus = execSync('git status --short', { cwd, encoding: 'utf-8' }).trim();
        if (gitStatus) {
          gitBranch = execSync('git branch --show-current', { cwd, encoding: 'utf-8' }).trim();
          gitLastCommit = execSync('git log --oneline -1', { cwd, encoding: 'utf-8' }).trim();
          const gitDiff = execSync('git diff --stat HEAD', { cwd, encoding: 'utf-8' }).trim();
          const ts = new Date().toISOString();
          contextForExtraction +=
            `\n\n[GIT STATE ${ts}]\n${gitStatus}` + (gitDiff ? `\n${gitDiff}` : '');
        }
      } catch {
        /* not a git repo or git unavailable — skip */
      }

      const captureConfig = captureConfigFromMemoConfig(config);
      const captureProvider = captureConfig ? createCaptureProvider(captureConfig) : null;
      const extracted = captureProvider
        ? await captureProvider.extract(contextForExtraction)
        : await extract(contextForExtraction, process.env.ANTHROPIC_API_KEY);

      // No-LLM checkpoint fallback: git shows in-progress work but no API key configured
      const hasLlm = Boolean(captureProvider || process.env.ANTHROPIC_API_KEY);
      if (extracted.length === 0 && gitStatus && !hasLlm) {
        const date = new Date().toISOString().slice(0, 10);
        const entry: PendingEntry = {
          id: `CHK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          projectId: resolveProjectId(repoRoot),
          candidates: [
            {
              name: `session-checkpoint-${date}`,
              type: 'workflow',
              description: `Resume point: ${gitBranch || 'uncommitted changes'}`,
              tags: ['checkpoint', 'wip'],
              confidence: 'high',
              content: `## Task\n${gitBranch || '(unknown — check git log)'}\n\n## Last Commit\n${gitLastCommit || '(none)'}\n\n## Next\n(fill in what remains)\n\n## Files\n${gitStatus}`,
            },
          ],
        };
        writePending(repoRoot, entry);
        await processQueue(repoRoot);
        log(`Wrote fallback checkpoint for session ${sessionId}`);
        await markSessionProcessed(metaDir, sessionId);
        continue;
      }

      if (extracted.length === 0) {
        log(`No memories extracted from session ${sessionId}`);
        await markSessionProcessed(metaDir, sessionId);
        continue;
      }

      const { dedupLLMBatch, createDedupLLM } = await import('../core/dedup');
      const { loadAll } = await import('../core/memory-loader');
      const existingMemories = loadAll(repoRoot, 'project');

      const candidates = extracted.map((item) => ({
        name: item.name,
        type: item.type,
        description: item.description,
        tags: item.tags,
        confidence: item.confidence,
        content: item.content,
      }));

      const dedupLLM = captureConfig ? createDedupLLM(captureConfig) : undefined;
      const { toWrite, toSkip, toUpdate } = await dedupLLMBatch(
        candidates,
        existingMemories,
        dedupLLM
      );

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

      // Append to rolling session log (workflow/sessions.md)
      const extractedNames = [...toWrite.map((c) => c.name), ...toUpdate.map((u) => u.targetName)];
      const { appendToSessionLog } = await import('../core/session-log');
      appendToSessionLog(repoRoot, {
        date: new Date().toISOString().slice(0, 10),
        branch: gitBranch,
        lastCommit: gitLastCommit,
        extractedNames,
        gitStatus,
      });

      await markSessionProcessed(metaDir, sessionId);
    }

    const { createDedupLLM: createDedupLLMFinal } = await import('../core/dedup');
    const finalCaptureConfig = captureConfigFromMemoConfig(config);
    const finalDedupLLM = finalCaptureConfig ? createDedupLLMFinal(finalCaptureConfig) : undefined;
    await processQueue(repoRoot, finalDedupLLM);
    return;
  } else if (options.session) {
    try {
      sessionText = await readSessionText(options.session);
    } catch (err) {
      error(`Failed to read session: ${(err as Error).message}`);
      return;
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
  const projectLabelSession = config.project.description
    ? `${config.project.name} — ${config.project.description}`
    : config.project.name;
  const sessionContext = `[PROJECT: ${projectLabelSession}]\n\n${sanitized}`;

  // 3. Extract memories via LLM (provider config takes precedence; falls back to smart-extractor)
  const captureConfig = captureConfigFromMemoConfig(config);
  const captureProvider = captureConfig ? createCaptureProvider(captureConfig) : null;
  const extracted = captureProvider
    ? await captureProvider.extract(sessionContext)
    : await extract(sessionContext, process.env.ANTHROPIC_API_KEY);

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
  const highValueMemories = memoriesWithValue.filter((item) => item.valueScore >= 0.7);

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
  const { createDedupLLM: createDedupLLMSession } = await import('../core/dedup');
  const sessionDedupLLM = captureConfig ? createDedupLLMSession(captureConfig) : undefined;
  await processQueue(repoRoot, sessionDedupLLM);

  // 6. Print summary
  console.log(`\n📝 Captured up to ${highValueMemories.length} high-value memories`);
  console.log(`   (duplicates skipped silently)\n`);

  // Note: index update is no-op for text engine
  if (config.embedding.engine === 'lancedb') {
    console.log('Run: memo index --incremental to update LanceDB');
  }
}
