/**
 * Onboarding command (memo init)
 * 4-step interactive TUI setup wizard using Ink
 *
 * ink, ink-text-input, and ink-select-input are ESM-only packages that cannot be
 * require()'d from a CommonJS bundle. All imports of those packages are done via
 * a Function-constructor-based dynamic import() so TypeScript does not rewrite
 * them to require() calls.
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
import { detectProjectName, detectPlatforms, type PlatformItem } from '../core/platform-detector';
import { fetchAvailableModels } from '../core/capture-provider';
import type { CaptureProviderName } from '../core/capture-provider';
import { CAPTURE_REGISTRY } from '../core/providers/capture-registry';
import { EMBEDDING_REGISTRY } from '../core/providers/embedding-registry';
import type { EmbeddingProvider } from '../core/embedding';
import { RERANKER_REGISTRY } from '../core/providers/reranker-registry';
import type { RerankerProvider } from '../core/reranker';

type MultiSelectItem = PlatformItem;

/** Check if Claude Code has auto-memory explicitly disabled */
function isAutoMemoryDisabled(): boolean {
  const settingsPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'settings.json');
  const settings = readJsonFile<Record<string, unknown>>(settingsPath, {});
  return settings.autoMemoryEnabled === false;
}

/** Get default-selected platform values (detected ones) */
function getDetectedPlatforms(items: MultiSelectItem[]): string[] {
  return items.filter(i => i.hint?.includes('✓')).map(i => i.value);
}

type Step =
  | 'project-name'
  | 'project-dir'
  | 'capture-provider'
  | 'capture-detecting'
  | 'capture-key'
  | 'capture-base-url'
  | 'capture-model'
  | 'platforms'
  | 'auto-memory-check'
  | 'workspace-remote'
  | 'workspace-local-path'
  | 'search-engine'
  | 'embedding-provider'
  | 'embedding-detecting'
  | 'ollama-url'
  | 'ollama-model'
  | 'embedding-key'
  | 'reranker'
  | 'reranker-provider'
  | 'reranker-detecting'
  | 'reranker-base-url'
  | 'reranker-key'
  | 'done';

export interface OnboardingState {
  step: Step;
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

export async function runSetup(state: OnboardingState, gitRoot: string): Promise<{ lines: string[]; autoMemoryWarning: boolean }> {
  const repoRoot = path.join(gitRoot, state.projectDir);
  const summaryLines: string[] = [];
  let autoMemoryWarning = false;

  // 1. Init config
  initConfig(repoRoot, state.projectName);

  // 1a. Write capture config if a provider was selected
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

  // 2. Create directory structure
  const TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
  for (const type of TYPES) {
    fs.mkdirSync(path.join(repoRoot, type), { recursive: true });
  }

  summaryLines.push(`Memories: ${repoRoot}`);

  // 3. Initialize workspace remote if provided
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

  // 4. Install platform adapters
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

  // 6. Update engine config if lancedb
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

  // Write all collected API keys to .memobank/.env in one pass
  const allKeys = state.collectedKeys;
  if (Object.keys(allKeys).length > 0) {
    const today = new Date().toISOString().split('T')[0];
    const envPath = path.join(repoRoot, '.env');
    const header = `# memobank API keys — do not commit\n# Generated by memo onboarding on ${today}\n\n`;
    const envLines = Object.entries(allKeys)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    fs.writeFileSync(envPath, header + envLines + '\n', 'utf-8');
    summaryLines.push(`API keys (${Object.keys(allKeys).join(', ')}) saved to ${envPath}`);
  }

  // Ensure .env is gitignored inside .memobank/ (internal belt-and-suspenders)
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

  // Write all runtime-generated paths to the project root .gitignore
  ensureGitignoreFull(gitRoot, state.projectDir);
  summaryLines.push('✓ .gitignore updated');

  // Auto-run code indexing so recall --code works immediately after setup.
  try {
    await codeScanCommand(undefined, { summarize: true, returnOnUnavailable: true, repo: repoRoot });
    summaryLines.push('✓ Code index built');
  } catch {
    summaryLines.push('  Tip: run memo index-code to enable code-aware recall');
  }

  // Detect existing project documentation and suggest capture commands.
  const DOC_CANDIDATES = [
    'README.md', 'README.rst', 'CLAUDE.md', 'CONTEXT.md',
    'ARCHITECTURE.md', 'CONTRIBUTING.md', 'DEVELOPMENT.md',
  ];
  const foundDocs = DOC_CANDIDATES.filter((f) => fs.existsSync(path.join(gitRoot, f)));
  const docsDir = path.join(gitRoot, 'docs');
  if (fs.existsSync(docsDir)) {
    try {
      const extras = fs.readdirSync(docsDir)
        .filter((f) => f.endsWith('.md'))
        .slice(0, 4)
        .map((f) => `docs/${f}`);
      foundDocs.push(...extras);
    } catch { /* ignore */ }
  }
  if (foundDocs.length > 0) {
    summaryLines.push(`  Project docs: ${foundDocs.join(', ')}`);
    summaryLines.push('  Import them: cat <file> | memo capture --session -');
  }

  return { lines: summaryLines, autoMemoryWarning };
}

export async function onboardingCommand(): Promise<void> {
  // Ink requires raw mode (interactive terminal). Detect early and give a clear
  // actionable message instead of a cryptic React stack trace.
  if (!process.stdin.isTTY || !(process.stdin as NodeJS.ReadStream & { setRawMode?: unknown }).setRawMode) {
    console.error(
      '⚠️  memo onboarding requires an interactive terminal (raw mode not supported here).\n' +
      '\n' +
      'Run this command in a real terminal, or use the non-interactive alternative:\n' +
      '\n' +
      '  memo init --platform claude-code    # Claude Code\n' +
      '  memo init --platform cursor         # Cursor\n' +
      '  memo init --platform codex          # Codex\n' +
      '  memo init                           # auto-detect installed platforms\n'
    );
    process.exit(1);
  }

  const gitRoot = findGitRoot(process.cwd());

  // Use Function constructor to bypass TypeScript's import() -> require() transform.
  // ink, ink-text-input, ink-select-input are ESM-only packages that cannot be
  // require()'d from a CommonJS bundle; this ensures Node uses its ESM loader.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const esmImport = new Function('specifier', 'return import(specifier)') as (s: string) => Promise<unknown>;

  const reactMod = await esmImport('react') as typeof import('react') & { default: typeof import('react') };
  const React = (reactMod.default ?? reactMod) as typeof import('react');
  const { useState, useRef } = React;

  const inkMod = await esmImport('ink') as typeof import('ink');
  const { render, Box, Text, useInput } = inkMod;
  type Key = Parameters<Parameters<typeof useInput>[0]>[1];

  type TextInputProps = { value: string; onChange: (v: string) => void; onSubmit: (v: string) => void };
  const inkTextInputMod = await esmImport('ink-text-input') as { default: unknown };
  const TextInput = inkTextInputMod.default as React.ComponentType<TextInputProps>;

  type SelectItem = { label: string; value: string };
  type SelectInputProps = { items: SelectItem[]; onSelect: (item: { label: string; value: unknown }) => void };
  const inkSelectInputMod = await esmImport('ink-select-input') as { default: unknown };
  const SelectInput = inkSelectInputMod.default as React.ComponentType<SelectInputProps>;

  const defaultName = detectProjectName();
  const platformItems = detectPlatforms();
  const detectedPlatforms = getDetectedPlatforms(platformItems);

  const searchEngineItems: SelectItem[] = [
    { label: 'Text (recommended, zero setup)', value: 'text' },
    { label: 'Vector / LanceDB (better recall, requires Ollama or OpenAI)', value: 'lancedb' },
  ];

  // Inline MultiSelect component (avoids a separate module that would need ink imports)
  interface InlineMultiSelectProps {
    label: string;
    items: MultiSelectItem[];
    defaultSelected?: string[];
    onSubmit: (selected: string[]) => void;
  }

  function InlineMultiSelect({ label, items, defaultSelected = [], onSubmit }: InlineMultiSelectProps) {
    const [cursor, setCursor] = useState(0);
    const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));

    useInput((input: string, key: Key) => {
      if (key.upArrow) { setCursor(c => Math.max(0, c - 1)); }
      if (key.downArrow) { setCursor(c => Math.min(items.length - 1, c + 1)); }
      if (input === ' ') {
        const item = items[cursor];
        if (item && !item.disabled) {
          setSelected(prev => {
            const next = new Set(prev);
            if (next.has(item.value)) { next.delete(item.value); } else { next.add(item.value); }
            return next;
          });
        }
      }
      if (key.return) {
        setSelected(prev => { onSubmit([...prev]); return prev; });
      }
    });

    return React.createElement(Box, { flexDirection: 'column', marginBottom: 1 },
      React.createElement(Text, { bold: true }, label),
      React.createElement(Text, { dimColor: true }, '  (↑↓ navigate · Space toggle · Enter confirm)'),
      ...items.map((item, i) =>
        React.createElement(Box, { key: item.value },
          React.createElement(Text, { color: (i === cursor ? 'cyan' : undefined) as 'cyan' | undefined },
            `  ${selected.has(item.value) ? '◉' : '◯'} ${item.label}`,
            item.hint ? React.createElement(Text, { dimColor: true }, `  ${item.hint}`) : null,
          ),
        ),
      ),
    );
  }

  async function fetchModelsForOnboarding(
    provider: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<SelectItem[]> {
    // Use raw descriptor.fetchModels (no fallback) so an empty result means
    // "nothing found" — the caller can then show a text input instead of a
    // select with only a placeholder entry like 'local-model'.
    const descriptor = CAPTURE_REGISTRY.get(provider as CaptureProviderName);
    if (!descriptor) return [];
    const models = await descriptor.fetchModels(apiKey, baseUrl);
    return models.map((m) => ({ label: m, value: m }));
  }

  function OnboardingApp() {
    const [state, setState] = useState<OnboardingState>({
      step: 'project-name',
      projectName: defaultName,
      projectDir: '.memobank',
      captureProvider: '',
      captureModel: '',
      captureBaseUrl: '',
      platforms: detectedPlatforms,
      enableAutoMemory: true,
      workspaceRemote: '',
      workspaceLocalPath: '',
      searchEngine: 'text',
      embeddingProvider: '',
      embeddingUrl: 'http://localhost:11434',
      embeddingModel: 'mxbai-embed-large',
      enableReranker: false,
      rerankerProvider: '',
      rerankerBaseUrl: '',
      collectedKeys: {},
    });
    const [nameInput, setNameInput] = useState(defaultName);
    const [projectDirInput, setProjectDirInput] = useState('.memobank');
    const [captureKeyInput, setCaptureKeyInput] = useState('');
    const [captureBaseUrlInput, setCaptureBaseUrlInput] = useState('');
    const [captureModelItems, setCaptureModelItems] = useState<SelectItem[]>([]);
    const [captureModelTextInput, setCaptureModelTextInput] = useState('');
    const [embeddingModelItems, setEmbeddingModelItems] = useState<SelectItem[]>([]);
    const [rerankerBaseUrlInput, setRerankerBaseUrlInput] = useState('');
    const [workspaceInput, setWorkspaceInput] = useState('');
    const [workspaceLocalPathInput, setWorkspaceLocalPathInput] = useState('');
    const [ollamaUrlInput, setOllamaUrlInput] = useState('http://localhost:11434');
    const [ollamaModelInput, setOllamaModelInput] = useState('mxbai-embed-large');
    const [embeddingKeyInput, setEmbeddingKeyInput] = useState('');
    const [rerankerKeyInput, setRerankerKeyInput] = useState('');
    const [done, setDone] = useState(false);
    const [summary, setSummary] = useState<string[]>([]);
    const [autoMemoryWarning, setAutoMemoryWarning] = useState(false);
    // Prevent double-submission
    const setupRunning = useRef(false);

    if (done) {
      return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { color: 'green', bold: true }, '✓ memobank initialized!'),
        ...summary.map((line, i) => React.createElement(Text, { key: i, dimColor: true }, `  ${line}`)),
        React.createElement(Text, { dimColor: true }, 'Run: memo recall "anything" to test'),
        autoMemoryWarning
          ? React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
              React.createElement(Text, { color: 'yellow', bold: true }, '⚠  Auto-memory is off'),
              React.createElement(Text, { color: 'yellow' }, '   Claude Code won\'t read or write project memories in .memobank/'),
              React.createElement(Text, { dimColor: true }, '   To enable later: set "autoMemoryEnabled": true in ~/.claude/settings.json'),
            )
          : null,
      );
    }

    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' }, '🧠  Memobank Setup'),
      React.createElement(Text, null, ' '),

      state.step === 'project-name' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null, 'Project name:'),
        React.createElement(TextInput, {
          value: nameInput,
          onChange: setNameInput,
          onSubmit: (value: string) => {
            setState(s => ({ ...s, step: 'project-dir', projectName: value || defaultName }));
          },
        }),
      ) : null,

      state.step === 'project-dir' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Project memory directory'),
        React.createElement(Text, { dimColor: true }, `  Folder inside ${gitRoot}/ that stores your project memories`),
        React.createElement(Text, { dimColor: true }, '  Default is .memobank — press Enter to confirm, or type a custom name:'),
        React.createElement(TextInput, {
          value: projectDirInput,
          onChange: setProjectDirInput,
          onSubmit: (value: string) => {
            const dir = (value || '.memobank').replace(/^\/+|\/+$/g, '');
            setState(s => ({ ...s, step: 'capture-provider', projectDir: dir }));
          },
        }),
      ) : null,

      state.step === 'capture-provider' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Capture LLM provider'),
        React.createElement(Text, { dimColor: true }, '  Powers AI memory extraction after each session'),
        React.createElement(SelectInput, {
          items: [...CAPTURE_REGISTRY.values()].map(d => ({ label: d.label, value: d.name })),
          onSelect: (item: { label: string; value: unknown }) => {
            const provider = String(item.value);
            const descriptor = CAPTURE_REGISTRY.get(provider as CaptureProviderName);
            const isLocal = !descriptor?.requiresApiKey;
            const defaultUrl = descriptor?.defaultBaseUrl ?? '';
            setState(s => ({
              ...s,
              captureProvider: provider,
              captureBaseUrl: isLocal ? defaultUrl : '',
              step: isLocal ? 'capture-detecting' : 'capture-key',
            }));
            if (isLocal) {
              fetchModelsForOnboarding(provider, undefined, defaultUrl)
                .then((models) => {
                  if (models.length > 0) {
                    setCaptureModelItems(models);
                    setState(s => ({ ...s, captureBaseUrl: defaultUrl, step: 'capture-model' }));
                  } else {
                    setState(s => ({ ...s, step: 'capture-base-url' }));
                  }
                })
                .catch(() => setState(s => ({ ...s, step: 'capture-base-url' })));
            }
          },
        }),
      ) : null,

      state.step === 'capture-detecting' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { dimColor: true },
          `  Probing ${state.captureBaseUrl} for available models…`),
      ) : null,

      state.step === 'embedding-detecting' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { dimColor: true },
          `  Probing ${state.embeddingUrl} for available models…`),
      ) : null,

      state.step === 'capture-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, `${state.captureProvider} API key`),
        React.createElement(Text, { dimColor: true }, '  Saved to .memobank/.env (not committed)'),
        React.createElement(TextInput, {
          value: captureKeyInput,
          onChange: setCaptureKeyInput,
          onSubmit: async (value: string) => {
            const key = value.trim();
            if (!key) return;
            const capDescriptor = CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName);
            const envKey = capDescriptor?.apiKeyEnv ?? 'OPENAI_API_KEY';
            if (capDescriptor?.requiresBaseUrlStep) {
              setState(s => ({
                ...s,
                step: 'capture-base-url',
                collectedKeys: { ...s.collectedKeys, [envKey]: key },
              }));
              return;
            }
            const models = await fetchModelsForOnboarding(state.captureProvider, key);
            setCaptureModelItems(models);
            setState(s => ({
              ...s,
              step: 'capture-model',
              collectedKeys: { ...s.collectedKeys, [envKey]: key },
            }));
          },
        }),
      ) : null,

      state.step === 'capture-base-url' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Base URL'),
        React.createElement(Text, { dimColor: true }, (() => {
          const d = CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName);
          return `  ${d?.label ?? state.captureProvider} endpoint (default: ${d?.defaultBaseUrl ?? ''})`;
        })()),
        React.createElement(TextInput, {
          value: captureBaseUrlInput || CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName)?.defaultBaseUrl || '',
          onChange: setCaptureBaseUrlInput,
          onSubmit: async (value: string) => {
            const capDescriptor = CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName);
            const baseUrl = value.trim() || capDescriptor?.defaultBaseUrl || '';
            const envKey = capDescriptor?.apiKeyEnv;
            const apiKey = envKey ? state.collectedKeys[envKey] : undefined;
            const models = await fetchModelsForOnboarding(state.captureProvider, apiKey, baseUrl);
            setCaptureModelItems(models);
            setState(s => ({ ...s, step: 'capture-model', captureBaseUrl: baseUrl }));
          },
        }),
      ) : null,

      state.step === 'capture-model' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Select capture model'),
        captureModelItems.length > 0
          ? React.createElement(SelectInput, {
              items: captureModelItems,
              onSelect: (item: { label: string; value: unknown }) => {
                setState(s => ({ ...s, captureModel: String(item.value), step: 'platforms' }));
              },
            })
          : React.createElement(Box, { flexDirection: 'column' },
              React.createElement(Text, { dimColor: true },
                `  (default: ${CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName)?.fallbackModels[0] ?? 'local-model'} — type to override)`
              ),
              React.createElement(TextInput, {
                value: captureModelTextInput,
                onChange: setCaptureModelTextInput,
                onSubmit: (value: string) => {
                  const model = value.trim() || (CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName)?.fallbackModels[0] ?? 'local-model');
                  setState(s => ({ ...s, captureModel: model, step: 'platforms' }));
                },
              }),
            ),
      ) : null,

      state.step === 'platforms' ? React.createElement(InlineMultiSelect, {
        label: 'Select platforms to integrate:',
        items: platformItems,
        defaultSelected: detectedPlatforms,
        onSubmit: (selected: string[]) => {
          const needsAutoMemoryCheck = selected.includes('claude-code') && isAutoMemoryDisabled();
          setState(s => ({
            ...s,
            platforms: selected,
            step: needsAutoMemoryCheck ? 'auto-memory-check' : 'workspace-remote',
          }));
        },
      }) : null,

      state.step === 'auto-memory-check' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'yellow' }, '⚠  Claude Code auto-memory is disabled'),
        React.createElement(Text, null, ' '),
        React.createElement(Text, null, 'memobank stores project memories in .memobank/ and relies on Claude Code\'s'),
        React.createElement(Text, null, 'auto-memory to load them at session start and save new ones automatically.'),
        React.createElement(Text, null, 'With auto-memory off, Claude Code won\'t read or write to .memobank/.'),
        React.createElement(Text, null, ' '),
        React.createElement(Text, { bold: true }, 'Enable auto-memory for this project?'),
        React.createElement(SelectInput, {
          items: [
            { label: 'Yes — enable auto-memory (recommended)', value: 'yes' },
            { label: 'No — keep it off', value: 'no' },
          ],
          onSelect: (item: { label: string; value: unknown }) => {
            const enable = String(item.value) === 'yes';
            setState(s => ({ ...s, enableAutoMemory: enable, step: 'workspace-remote' }));
          },
        }),
      ) : null,

      state.step === 'workspace-remote' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Workspace remote'),
        React.createElement(Text, { dimColor: true }, '  Org-wide memories shared across repos (e.g. git@github.com:myorg/platform-docs.git)'),
        React.createElement(Text, { dimColor: true }, '  Optional — press Enter to skip:'),
        React.createElement(TextInput, {
          value: workspaceInput,
          onChange: setWorkspaceInput,
          onSubmit: (value: string) => {
            const remote = value.trim();
            setState(s => ({
              ...s,
              workspaceRemote: remote,
              step: remote ? 'workspace-local-path' : 'search-engine',
            }));
          },
        }),
      ) : null,

      state.step === 'workspace-local-path' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Local workspace path'),
        React.createElement(Text, { dimColor: true }, '  If the repo is already cloned, enter its path (e.g. ~/repos/company-wiki)'),
        React.createElement(Text, { dimColor: true }, '  Press Enter to clone into the default location (~/.memobank/_workspace/):'),
        React.createElement(TextInput, {
          value: workspaceLocalPathInput,
          onChange: setWorkspaceLocalPathInput,
          onSubmit: (value: string) => {
            setState(s => ({ ...s, workspaceLocalPath: value.trim(), step: 'search-engine' }));
          },
        }),
      ) : null,

      state.step === 'search-engine' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Search engine:'),
        React.createElement(SelectInput, {
          items: searchEngineItems,
          onSelect: (item: { label: string; value: unknown }) => {
            const engine = String(item.value);
            if (engine === 'lancedb') {
              setState(s => ({ ...s, step: 'embedding-provider', searchEngine: engine }));
            } else {
              setState(s => ({ ...s, step: 'reranker', searchEngine: engine }));
            }
          },
        }),
      ) : null,

      state.step === 'embedding-provider' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Embedding provider:'),
        React.createElement(SelectInput, {
          items: [...EMBEDDING_REGISTRY.values()]
            .filter(d => d.showInWizard)
            .map(d => ({ label: d.label, value: d.name })),
          onSelect: (item: { label: string; value: unknown }) => {
            const provider = String(item.value);
            const embDesc = EMBEDDING_REGISTRY.get(provider as EmbeddingProvider);
            const envKey = embDesc?.apiKeyEnv;
            const alreadyHaveKey = embDesc?.requiresApiKey && envKey && Boolean(state.collectedKeys[envKey]);
            if (!embDesc?.requiresApiKey && embDesc?.fetchModels) {
              const defaultUrl = embDesc.defaultBaseUrl ?? 'http://localhost:11434/v1';
              const bareDefault = defaultUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
              setState(s => ({ ...s, embeddingProvider: provider, embeddingUrl: bareDefault, step: 'embedding-detecting' }));
              embDesc.fetchModels(defaultUrl).then((fetched) => {
                if (fetched.length > 0) {
                  setEmbeddingModelItems(fetched.map((m) => ({ label: m, value: m })));
                  setState(s => ({ ...s, step: 'ollama-model' }));
                } else {
                  setOllamaUrlInput(bareDefault);
                  setState(s => ({ ...s, step: 'ollama-url' }));
                }
              }).catch(() => {
                setOllamaUrlInput(bareDefault);
                setState(s => ({ ...s, step: 'ollama-url' }));
              });
            } else {
              const defaultUrl = embDesc?.defaultBaseUrl ?? 'http://localhost:11434/v1';
              const bareDefault = defaultUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
              if (!embDesc?.requiresApiKey) {
                setOllamaUrlInput(bareDefault);
              }
              setState(s => ({
                ...s,
                embeddingProvider: provider,
                step: !embDesc?.requiresApiKey ? 'ollama-url' : alreadyHaveKey ? 'reranker' : 'embedding-key',
              }));
            }
          },
        }),
      ) : null,

      state.step === 'ollama-url' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null,
          `${EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)?.label ?? state.embeddingProvider} base URL:`
        ),
        React.createElement(Text, { dimColor: true }, (() => {
          const defaultBase = (EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)?.defaultBaseUrl ?? '')
            .replace(/\/v1\/?$/, '');
          return `  (default: ${defaultBase} — press Enter to confirm)`;
        })()),
        React.createElement(TextInput, {
          value: ollamaUrlInput,
          onChange: setOllamaUrlInput,
          onSubmit: async (value: string) => {
            const embDesc = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider);
            const defaultBase = (embDesc?.defaultBaseUrl ?? '').replace(/\/v1\/?$/, '');
            const resolvedUrl = value.trim() || defaultBase;
            if (embDesc?.fetchModels) {
              const fetched = await embDesc.fetchModels(resolvedUrl + '/v1');
              setEmbeddingModelItems(fetched.map((m) => ({ label: m, value: m })));
            }
            setState(s => ({ ...s, step: 'ollama-model', embeddingUrl: resolvedUrl }));
          },
        }),
      ) : null,

      state.step === 'ollama-model' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null,
          `${EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)?.label ?? state.embeddingProvider} embedding model:`
        ),
        embeddingModelItems.length > 0
          ? React.createElement(SelectInput, {
              items: embeddingModelItems,
              onSelect: (item: { label: string; value: unknown }) => {
                setState(s => ({ ...s, step: 'reranker', embeddingModel: String(item.value) }));
              },
            })
          : React.createElement(Box, { flexDirection: 'column' },
              React.createElement(Text, { dimColor: true },
                `  (default: ${EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)?.defaultModel ?? 'local-model'} — type to override)`
              ),
              React.createElement(TextInput, {
                value: ollamaModelInput,
                onChange: setOllamaModelInput,
                onSubmit: (value: string) => {
                  const defaultModel = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)?.defaultModel ?? 'local-model';
                  setState(s => ({ ...s, step: 'reranker', embeddingModel: value || defaultModel }));
                },
              }),
            ),
      ) : null,

      state.step === 'embedding-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true },
          `${EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)?.label ?? state.embeddingProvider} API key (for embeddings)`
        ),
        React.createElement(Text, { dimColor: true }, '  Saved to .memobank/.env — press Enter to skip'),
        React.createElement(TextInput, {
          value: embeddingKeyInput,
          onChange: setEmbeddingKeyInput,
          onSubmit: (value: string) => {
            const key = value.trim();
            const envKey = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)?.apiKeyEnv ?? '';
            setState(s => ({
              ...s,
              step: 'reranker',
              collectedKeys: key && envKey ? { ...s.collectedKeys, [envKey]: key } : s.collectedKeys,
            }));
          },
        }),
      ) : null,

      state.step === 'reranker' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Enable reranker?'),
        React.createElement(Text, { dimColor: true }, '  Re-ranks results for better precision (Jina/Cohere need API key; oMLX is local, no key needed)'),
        React.createElement(SelectInput, {
          items: [
            { label: 'No', value: 'no' },
            { label: 'Yes', value: 'yes' },
          ],
          onSelect: (item: { label: string; value: unknown }) => {
            if (String(item.value) === 'yes') {
              setState(s => ({ ...s, step: 'reranker-provider' }));
            } else {
              if (setupRunning.current) return;
              setupRunning.current = true;
              const finalState = { ...state, step: 'done' as Step, enableReranker: false };
              setState(finalState);
              runSetup(finalState, gitRoot).then(({ lines, autoMemoryWarning: warn }) => {
                setSummary(lines);
                setAutoMemoryWarning(warn);
                setDone(true);
              }).catch((err: Error) => {
                setSummary([`Setup failed: ${err.message}`]);
                setDone(true);
              });
            }
          },
        }),
      ) : null,

      state.step === 'reranker-detecting' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { dimColor: true },
          `  Probing ${state.rerankerBaseUrl} for reranker…`),
      ) : null,

      state.step === 'reranker-provider' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Reranker provider:'),
        React.createElement(SelectInput, {
          items: [...RERANKER_REGISTRY.values()].map(d => ({ label: d.label, value: d.name })),
          onSelect: (item: { label: string; value: unknown }) => {
            const provider = String(item.value);
            const rerankDesc = RERANKER_REGISTRY.get(provider as RerankerProvider);
            if (!rerankDesc?.requiresApiKey) {
              const defaultUrl = rerankDesc?.defaultBaseUrl ?? 'http://localhost:8000/v1';
              setRerankerBaseUrlInput(defaultUrl);
              setState(s => ({ ...s, enableReranker: true, rerankerProvider: provider, rerankerBaseUrl: defaultUrl, step: 'reranker-detecting' }));
              // Probe default URL — if reachable, skip URL step
              fetch(defaultUrl.replace(/\/$/, '') + '/models')
                .then((res) => {
                  setState(s => ({
                    ...s,
                    step: res.ok ? 'done' : 'reranker-base-url',
                  }));
                  if (res.ok) {
                    const fs2 = { ...state, step: 'done' as Step, enableReranker: true, rerankerProvider: provider, rerankerBaseUrl: defaultUrl };
                    runSetup(fs2, gitRoot).then(({ lines, autoMemoryWarning: warn }) => {
                      setSummary(lines);
                      setAutoMemoryWarning(warn);
                      setDone(true);
                    }).catch((err: Error) => {
                      setSummary([`Setup failed: ${err.message}`]);
                      setDone(true);
                    });
                  }
                })
                .catch(() => setState(s => ({ ...s, step: 'reranker-base-url' })));
              return;
            }
            const keyVar = rerankDesc.apiKeyEnv ?? '';
            const alreadyHaveKey = Boolean(state.collectedKeys[keyVar]);
            if (alreadyHaveKey) {
              if (setupRunning.current) return;
              setupRunning.current = true;
              const finalState = { ...state, step: 'done' as Step, enableReranker: true, rerankerProvider: provider };
              setState(finalState);
              runSetup(finalState, gitRoot).then(({ lines, autoMemoryWarning: warn }) => {
                setSummary(lines);
                setAutoMemoryWarning(warn);
                setDone(true);
              }).catch((err: Error) => {
                setSummary([`Setup failed: ${err.message}`]);
                setDone(true);
              });
            } else {
              setState(s => ({ ...s, step: 'reranker-key', enableReranker: true, rerankerProvider: provider }));
            }
          },
        }),
      ) : null,

      state.step === 'reranker-base-url' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true },
          `${RERANKER_REGISTRY.get(state.rerankerProvider as RerankerProvider)?.label ?? state.rerankerProvider} base URL:`
        ),
        React.createElement(Text, { dimColor: true },
          `  (default: ${RERANKER_REGISTRY.get(state.rerankerProvider as RerankerProvider)?.defaultBaseUrl ?? 'http://localhost:8000/v1'} — press Enter to confirm)`
        ),
        React.createElement(TextInput, {
          value: rerankerBaseUrlInput,
          onChange: setRerankerBaseUrlInput,
          onSubmit: (value: string) => {
            if (setupRunning.current) return;
            setupRunning.current = true;
            const rerankDesc = RERANKER_REGISTRY.get(state.rerankerProvider as RerankerProvider);
            const resolvedUrl = value.trim() || rerankDesc?.defaultBaseUrl || 'http://localhost:8000/v1';
            const finalState = { ...state, step: 'done' as Step, rerankerBaseUrl: resolvedUrl };
            setState(finalState);
            runSetup(finalState, gitRoot).then(({ lines, autoMemoryWarning: warn }) => {
              setSummary(lines);
              setAutoMemoryWarning(warn);
              setDone(true);
            }).catch((err: Error) => {
              setSummary([`Setup failed: ${err.message}`]);
              setDone(true);
            });
          },
        }),
      ) : null,

      state.step === 'reranker-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, `${RERANKER_REGISTRY.get(state.rerankerProvider as RerankerProvider)?.apiKeyEnv ?? state.rerankerProvider}:`),
        React.createElement(Text, { dimColor: true }, '  Saved to .memobank/.env — press Enter to skip'),
        React.createElement(TextInput, {
          value: rerankerKeyInput,
          onChange: setRerankerKeyInput,
          onSubmit: (value: string) => {
            if (setupRunning.current) return;
            setupRunning.current = true;
            const key = value.trim();
            const keyVar = RERANKER_REGISTRY.get(state.rerankerProvider as RerankerProvider)?.apiKeyEnv ?? '';
            const finalState = {
              ...state,
              step: 'done' as Step,
              collectedKeys: key ? { ...state.collectedKeys, [keyVar]: key } : state.collectedKeys,
            };
            setState(finalState);
            runSetup(finalState, gitRoot).then(({ lines, autoMemoryWarning: warn }) => {
              setSummary(lines);
              setAutoMemoryWarning(warn);
              setDone(true);
            }).catch((err: Error) => {
              setSummary([`Setup failed: ${err.message}`]);
              setDone(true);
            });
          },
        }),
      ) : null,
    );
  }

  const { waitUntilExit } = render(React.createElement(OnboardingApp));
  await waitUntilExit();
}
