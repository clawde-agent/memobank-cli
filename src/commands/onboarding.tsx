/**
 * Onboarding command (memo onboarding / memo init --interactive)
 * Interactive setup wizard using @clack/prompts.
 *
 * @clack/prompts is ESM-only; it is loaded via a Function-constructor dynamic
 * import so TypeScript does not rewrite it to require() in the CommonJS output.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readJsonFile } from '../core/fs-utils';
import { findGitRoot } from '../core/dir-resolver';
import { loadConfig, writeConfig, initConfig } from '../config';
import { installClaudeCode } from '../platforms/claude-code';
import { installCodex } from '../platforms/codex';
import { installGemini } from '../platforms/gemini';
import { installQwen } from '../platforms/qwen';
import { installCursor } from '../platforms/cursor';
import { workspaceInit } from './workspace';
import { codeScanCommand } from './code-scan';
import { ensureGitignoreFull } from './init';
import { detectProjectName, detectPlatforms } from '../core/platform-detector';
import type { CaptureProviderName } from '../core/capture-provider';
import { CAPTURE_REGISTRY } from '../core/providers/capture-registry';
import { EMBEDDING_REGISTRY } from '../core/providers/embedding-registry';
import type { EmbeddingProvider } from '../core/embedding';
import { RERANKER_REGISTRY } from '../core/providers/reranker-registry';
import type { RerankerProvider } from '../core/reranker';

/** Check if Claude Code has auto-memory explicitly disabled */
function isAutoMemoryDisabled(): boolean {
  const settingsPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'settings.json');
  const settings = readJsonFile<Record<string, unknown>>(settingsPath, {});
  return settings.autoMemoryEnabled === false;
}

export interface OnboardingState {
  step: string;
  projectName: string;
  projectDir: string;
  captureProvider: string;
  captureModel: string;
  captureBaseUrl: string;
  platforms: string[];
  enableAutoMemory: boolean;
  workspaceRemote: string;
  workspaceLocalPath: string;
  searchEngine: string;
  embeddingProvider: string;
  embeddingUrl: string;
  embeddingModel: string;
  enableReranker: boolean;
  rerankerProvider: string;
  rerankerBaseUrl: string;
  collectedKeys: Record<string, string>;
}

export async function runSetup(
  state: OnboardingState,
  gitRoot: string
): Promise<{ lines: string[]; autoMemoryWarning: boolean }> {
  const repoRoot = path.join(gitRoot, state.projectDir);
  const summaryLines: string[] = [];
  let autoMemoryWarning = false;

  initConfig(repoRoot, state.projectName);

  if (state.captureProvider) {
    const capDescriptor = CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName);
    const config = loadConfig(repoRoot);
    config.capture = {
      provider: state.captureProvider as CaptureProviderName,
      model: state.captureModel || capDescriptor?.defaultModel || 'unknown',
      ...(state.captureBaseUrl ? { base_url: state.captureBaseUrl } : {}),
    };
    writeConfig(repoRoot, config);
    summaryLines.push(`Capture: ${state.captureProvider} / ${state.captureModel || '(default model)'}`);
  }

  const TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
  for (const type of TYPES) {
    fs.mkdirSync(path.join(repoRoot, type), { recursive: true });
  }
  summaryLines.push(`Memories: ${repoRoot}`);

  if (state.workspaceRemote.trim()) {
    try {
      const localPath = state.workspaceLocalPath.trim() || undefined;
      await workspaceInit(state.workspaceRemote.trim(), repoRoot, localPath);
      const wsLabel = localPath
        ? `${state.workspaceRemote.trim()} (local: ${localPath})`
        : state.workspaceRemote.trim();
      summaryLines.push(`Workspace: ${wsLabel}`);
    } catch (err) {
      summaryLines.push(`⚠  Workspace init failed: ${(err as Error).message}`);
    }
  }

  for (const platform of state.platforms) {
    switch (platform) {
      case 'claude-code':
        await installClaudeCode(repoRoot, state.enableAutoMemory);
        if (!state.enableAutoMemory) { autoMemoryWarning = true; }
        break;
      case 'codex': await installCodex(process.cwd()); break;
      case 'gemini': await installGemini(); break;
      case 'qwen': await installQwen(); break;
      case 'cursor': await installCursor(process.cwd()); break;
    }
  }
  if (state.platforms.length > 0) {
    summaryLines.push(`Platforms: ${state.platforms.join(', ')}`);
  }

  if (state.searchEngine === 'lancedb') {
    const config = loadConfig(repoRoot);
    config.embedding.engine = 'lancedb';
    const embDescriptor = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider);
    if (embDescriptor) {
      config.embedding.provider = state.embeddingProvider;
      const model = state.embeddingModel || embDescriptor.defaultModel;
      config.embedding.model = model;
      config.embedding.dimensions = embDescriptor.defaultDimensions;
      if (!embDescriptor.requiresApiKey) {
        const rawUrl = (state.embeddingUrl || embDescriptor.defaultBaseUrl)
          .replace(/\/v1\/?$/, '').replace(/\/$/, '');
        config.embedding.base_url = rawUrl + '/v1';
        const connErr = await embDescriptor.testConnection?.(rawUrl, model);
        if (connErr) {
          summaryLines.push(`⚠  ${embDescriptor.label}: ${connErr}`);
        } else if (embDescriptor.testConnection) {
          summaryLines.push(`✓ ${embDescriptor.label} connected, model "${model}" ready`);
        } else {
          summaryLines.push(`${embDescriptor.label} embedding at ${rawUrl}`);
        }
      }
    }
    writeConfig(repoRoot, config);
  }

  if (state.enableReranker && state.rerankerProvider) {
    const config = loadConfig(repoRoot);
    config.reranker = {
      enabled: true,
      provider: state.rerankerProvider as RerankerProvider,
      ...(state.rerankerBaseUrl ? { base_url: state.rerankerBaseUrl } : {}),
    };
    writeConfig(repoRoot, config);
    summaryLines.push(`Reranker: ${state.rerankerProvider}`);
  }

  const allKeys = state.collectedKeys;
  if (Object.keys(allKeys).length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const envPath = path.join(repoRoot, '.env');
    const header = `# memobank API keys — do not commit\n# Generated by memo onboarding on ${today}\n\n`;
    const envLines = Object.entries(allKeys).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(envPath, header + envLines + '\n', 'utf-8');
    summaryLines.push(`API keys (${Object.keys(allKeys).join(', ')}) saved to ${envPath}`);
  }

  const internalGitignorePath = path.join(repoRoot, '.gitignore');
  const existingInternal = fs.existsSync(internalGitignorePath)
    ? fs.readFileSync(internalGitignorePath, 'utf-8')
    : '';
  if (!existingInternal.includes('.env')) {
    fs.writeFileSync(
      internalGitignorePath,
      existingInternal + (existingInternal.endsWith('\n') ? '' : '\n') + '.env\n',
      'utf-8'
    );
  }

  ensureGitignoreFull(gitRoot, state.projectDir);
  summaryLines.push('✓ .gitignore updated');

  try {
    await codeScanCommand(undefined, { summarize: true, returnOnUnavailable: true, repo: repoRoot });
    summaryLines.push('✓ Code index built');
  } catch {
    summaryLines.push('  Tip: run memo index-code to enable code-aware recall');
  }

  const DOC_CANDIDATES = [
    'README.md', 'README.rst', 'CLAUDE.md', 'CONTEXT.md',
    'ARCHITECTURE.md', 'CONTRIBUTING.md', 'DEVELOPMENT.md',
  ];
  const foundDocs = DOC_CANDIDATES.filter((f) => fs.existsSync(path.join(gitRoot, f)));
  const docsDir = path.join(gitRoot, 'docs');
  if (fs.existsSync(docsDir)) {
    try {
      const extras = fs.readdirSync(docsDir).filter((f) => f.endsWith('.md')).slice(0, 4);
      foundDocs.push(...extras.map((f) => `docs/${f}`));
    } catch { /* ignore */ }
  }
  if (foundDocs.length > 0) {
    summaryLines.push(`  Project docs: ${foundDocs.join(', ')}`);
    summaryLines.push('  Import them: cat <file> | memo capture --session -');
  }

  return { lines: summaryLines, autoMemoryWarning };
}

// ---------------------------------------------------------------------------
// Clack-based interactive wizard
// ---------------------------------------------------------------------------

export async function onboardingCommand(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error(
      '⚠️  memo onboarding requires an interactive terminal.\n\n' +
      'Run in a real terminal, or use the non-interactive alternative:\n\n' +
      '  memo init --platform claude-code\n' +
      '  memo init\n'
    );
    process.exit(1);
  }

  const gitRoot = findGitRoot(process.cwd());

  // @clack/prompts is ESM-only — bypass TypeScript's require() rewrite.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const esmImport = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;

  const clack = await esmImport('@clack/prompts') as typeof import('@clack/prompts');
  const { intro, outro, text, password, select, multiselect, confirm, spinner, isCancel, cancel, note } = clack;

  const abort = (msg = 'Setup cancelled.'): never => {
    cancel(msg);
    process.exit(0);
  };

  const check = <T,>(v: T | symbol): T => {
    if (isCancel(v)) abort();
    return v as T;
  };

  intro('🧠  Memobank Setup');

  // ── 1. Project name ────────────────────────────────────────────────────────
  const projectName = check(await text({
    message: 'Project name',
    defaultValue: detectProjectName(),
    placeholder: detectProjectName(),
  })) as string;

  // ── 2. Memory directory ────────────────────────────────────────────────────
  const projectDir = check(await text({
    message: 'Memory directory (inside repo root)',
    defaultValue: '.memobank',
    placeholder: '.memobank',
  })) as string;

  const collectedKeys: Record<string, string> = {};

  // ── 3. Capture LLM provider ───────────────────────────────────────────────
  const captureProviderValue = check(await select({
    message: 'Capture LLM provider (powers AI memory extraction)',
    options: [...CAPTURE_REGISTRY.values()].map((d) => ({ value: d.name, label: d.label })),
  })) as string;

  const capDesc = CAPTURE_REGISTRY.get(captureProviderValue as CaptureProviderName);
  let captureBaseUrl = capDesc?.defaultBaseUrl ?? '';
  let captureModel = capDesc?.defaultModel ?? '';

  if (capDesc?.requiresApiKey) {
    const apiKey = check(await password({
      message: `${capDesc.label} API key`,
      validate: (v) => (!(v ?? '').trim() ? 'API key is required' : undefined),
    })) as string;
    if (capDesc.apiKeyEnv) collectedKeys[capDesc.apiKeyEnv] = apiKey.trim();

    if (capDesc.requiresBaseUrlStep) {
      captureBaseUrl = check(await text({
        message: `${capDesc.label} base URL`,
        defaultValue: capDesc.defaultBaseUrl ?? '',
        placeholder: capDesc.defaultBaseUrl ?? '',
      })) as string || capDesc.defaultBaseUrl ?? '';
    }

    const s = spinner();
    s.start('Fetching available models…');
    const envKey = capDesc.apiKeyEnv;
    const apiKeyValue = envKey ? collectedKeys[envKey] : undefined;
    const models = await capDesc.fetchModels(apiKeyValue, captureBaseUrl || undefined).catch(() => []);
    s.stop(models.length > 0 ? `Found ${models.length} models` : 'Using default model list');

    const modelChoices = (models.length > 0 ? models : capDesc.fallbackModels).map((m) => ({ value: m, label: m }));
    captureModel = check(await select({ message: 'Capture model', options: modelChoices })) as string;

  } else {
    if (capDesc?.requiresBaseUrlStep) {
      captureBaseUrl = check(await text({
        message: `${capDesc.label} base URL`,
        defaultValue: capDesc.defaultBaseUrl ?? '',
        placeholder: capDesc.defaultBaseUrl ?? '',
      })) as string || capDesc?.defaultBaseUrl ?? '';
    }

    const s = spinner();
    s.start('Probing for available models…');
    const models = await (capDesc?.fetchModels(undefined, captureBaseUrl || undefined) ?? Promise.resolve([])).catch(() => []);
    s.stop(models.length > 0 ? `Found ${models.length} models` : 'No models detected');

    if (models.length > 0) {
      captureModel = check(await select({
        message: 'Capture model',
        options: models.map((m) => ({ value: m, label: m })),
      })) as string;
    } else {
      captureModel = check(await text({
        message: 'Capture model',
        defaultValue: capDesc?.fallbackModels[0] ?? 'local-model',
        placeholder: capDesc?.fallbackModels[0] ?? 'local-model',
      })) as string || capDesc?.fallbackModels[0] ?? 'local-model';
    }
  }

  // ── 4. Platforms ──────────────────────────────────────────────────────────
  const platformItems = detectPlatforms();
  const detectedValues = platformItems.filter((i) => i.hint?.includes('✓')).map((i) => i.value);

  const platforms = check(await multiselect({
    message: 'Platforms to integrate',
    options: platformItems.map((i) => ({ value: i.value, label: i.label, hint: i.hint })),
    initialValues: detectedValues,
    required: false,
  })) as string[];

  // ── 5. Auto-memory check (Claude Code only) ────────────────────────────────
  let enableAutoMemory = true;
  if (platforms.includes('claude-code') && isAutoMemoryDisabled()) {
    note(
      'memobank relies on Claude Code auto-memory to load project memories\n' +
      'at session start and save new ones automatically.\n' +
      'With auto-memory off, Claude Code won\'t read/write .memobank/.',
      '⚠  Auto-memory is disabled'
    );
    enableAutoMemory = check(await confirm({
      message: 'Enable auto-memory for this project?',
      initialValue: true,
    })) as boolean;
  }

  // ── 6. Workspace remote ───────────────────────────────────────────────────
  const workspaceRemote = check(await text({
    message: 'Workspace remote (org-wide memories — optional, Enter to skip)',
    placeholder: 'git@github.com:myorg/platform-docs.git',
  })) as string;

  let workspaceLocalPath = '';
  if (workspaceRemote.trim()) {
    workspaceLocalPath = check(await text({
      message: 'Local workspace path (Enter to use default ~/.memobank/_workspace/)',
      placeholder: '~/repos/company-wiki',
    })) as string;
  }

  // ── 7. Search engine ──────────────────────────────────────────────────────
  const searchEngine = check(await select({
    message: 'Search engine',
    options: [
      { value: 'text', label: 'Text (recommended, zero setup)' },
      { value: 'lancedb', label: 'Vector / LanceDB (better recall, requires an embedding provider)' },
    ],
  })) as string;

  // ── 8. Embedding provider (lancedb only) ──────────────────────────────────
  let embeddingProvider = '';
  let embeddingUrl = '';
  let embeddingModel = '';

  if (searchEngine === 'lancedb') {
    embeddingProvider = check(await select({
      message: 'Embedding provider',
      options: [...EMBEDDING_REGISTRY.values()]
        .filter((d) => d.showInWizard)
        .map((d) => ({ value: d.name, label: d.label })),
    })) as string;

    const embDesc = EMBEDDING_REGISTRY.get(embeddingProvider as EmbeddingProvider);

    if (embDesc?.requiresApiKey) {
      const embKey = check(await password({
        message: `${embDesc.label} API key (for embeddings)`,
      })) as string;
      if (embDesc.apiKeyEnv && embKey.trim()) collectedKeys[embDesc.apiKeyEnv] = embKey.trim();

      const s = spinner();
      s.start('Fetching embedding models…');
      const models = await embDesc.fetchModels?.(embDesc.defaultBaseUrl, embKey.trim() || undefined).catch(() => []) ?? [];
      s.stop(models.length > 0 ? `Found ${models.length} models` : 'Using default model list');

      const modelChoices = (models.length > 0 ? models : [embDesc.defaultModel]).map((m) => ({ value: m, label: m }));
      embeddingModel = check(await select({ message: 'Embedding model', options: modelChoices })) as string;
      embeddingUrl = embDesc.defaultBaseUrl;

    } else {
      const defaultBase = (embDesc?.defaultBaseUrl ?? 'http://localhost:11434/v1')
        .replace(/\/v1\/?$/, '').replace(/\/$/, '');

      embeddingUrl = check(await text({
        message: `${embDesc?.label ?? embeddingProvider} base URL`,
        defaultValue: defaultBase,
        placeholder: defaultBase,
      })) as string || defaultBase;

      const s = spinner();
      s.start('Fetching embedding models…');
      const models = await embDesc?.fetchModels?.(`${embeddingUrl}/v1`).catch(() => []) ?? [];
      s.stop(models.length > 0 ? `Found ${models.length} models` : 'No models detected');

      if (models.length > 0) {
        embeddingModel = check(await select({
          message: 'Embedding model',
          options: models.map((m) => ({ value: m, label: m })),
        })) as string;
      } else {
        embeddingModel = check(await text({
          message: 'Embedding model',
          defaultValue: embDesc?.defaultModel ?? 'local-model',
          placeholder: embDesc?.defaultModel ?? 'local-model',
        })) as string || embDesc?.defaultModel ?? 'local-model';
      }
    }
  }

  // ── 9. Reranker ───────────────────────────────────────────────────────────
  let enableReranker = false;
  let rerankerProvider = '';
  let rerankerBaseUrl = '';

  const wantsReranker = check(await confirm({
    message: 'Enable reranker? (improves recall precision)',
    initialValue: false,
  })) as boolean;

  if (wantsReranker) {
    rerankerProvider = check(await select({
      message: 'Reranker provider',
      options: [...RERANKER_REGISTRY.values()].map((d) => ({ value: d.name, label: d.label })),
    })) as string;

    const rerankDesc = RERANKER_REGISTRY.get(rerankerProvider as RerankerProvider);

    if (rerankDesc?.requiresApiKey) {
      const rerankKey = check(await password({
        message: `${rerankDesc.apiKeyEnv ?? rerankDesc.label} API key`,
      })) as string;
      if (rerankDesc.apiKeyEnv && rerankKey.trim()) collectedKeys[rerankDesc.apiKeyEnv] = rerankKey.trim();
    } else {
      const defaultUrl = rerankDesc?.defaultBaseUrl ?? 'http://localhost:8000/v1';
      rerankerBaseUrl = check(await text({
        message: `${rerankDesc?.label ?? rerankerProvider} base URL`,
        defaultValue: defaultUrl,
        placeholder: defaultUrl,
      })) as string || defaultUrl;
    }

    enableReranker = true;
  }

  // ── 10. Run setup ─────────────────────────────────────────────────────────
  const state: OnboardingState = {
    step: 'done',
    projectName: (projectName as string).trim() || detectProjectName(),
    projectDir: ((projectDir as string) || '.memobank').replace(/^\/+|\/+$/g, ''),
    captureProvider: captureProviderValue,
    captureModel,
    captureBaseUrl,
    platforms,
    enableAutoMemory,
    workspaceRemote: (workspaceRemote as string) || '',
    workspaceLocalPath,
    searchEngine,
    embeddingProvider,
    embeddingUrl,
    embeddingModel,
    enableReranker,
    rerankerProvider,
    rerankerBaseUrl,
    collectedKeys,
  };

  const s = spinner();
  s.start('Initializing memobank…');
  let summaryLines: string[] = [];
  let autoMemoryWarning = false;
  try {
    const result = await runSetup(state, gitRoot);
    summaryLines = result.lines;
    autoMemoryWarning = result.autoMemoryWarning;
    s.stop('Done!');
  } catch (err) {
    s.stop('Setup failed');
    cancel(String((err as Error).message));
    process.exit(1);
  }

  note(summaryLines.join('\n'), 'Summary');

  if (autoMemoryWarning) {
    note(
      'Claude Code will not read or write project memories in .memobank/\n' +
      'To enable later: set "autoMemoryEnabled": true in ~/.claude/settings.json',
      'Auto-memory is off'
    );
  }

  outro('Run: memo recall "anything" to test');
}
