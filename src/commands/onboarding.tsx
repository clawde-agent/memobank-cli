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
import { findGitRoot } from '../core/store';
import { loadConfig, writeConfig, initConfig } from '../config';
import { installClaudeCode } from '../platforms/claude-code';
import { installCodex } from '../platforms/codex';
import { installGemini } from '../platforms/gemini';
import { installQwen } from '../platforms/qwen';
import { installCursor } from '../platforms/cursor';
import { workspaceInit } from './workspace';
import { codeScanCommand } from './code-scan';
import { detectProjectName, detectPlatforms, type PlatformItem } from '../core/platform-detector';
import { fetchAvailableModels } from '../core/capture-provider';
import type { CaptureProviderName } from '../core/capture-provider';

type MultiSelectItem = PlatformItem;

/** Test Ollama connectivity and model availability */
async function testOllamaConnection(baseUrl: string, model: string): Promise<string | null> {
  try {
    const url = baseUrl.replace(/\/$/, '');
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) return `Ollama returned HTTP ${res.status}`;
    const data = await res.json() as { models?: { name: string }[] };
    const models = data.models?.map((m: { name: string }) => m.name) ?? [];
    const found = models.some((n: string) => n === model || n.startsWith(`${model}:`));
    if (!found) {
      return `Model "${model}" not found — run: ollama pull ${model}`;
    }
    return null; // success
  } catch {
    return `Cannot reach Ollama at ${baseUrl} — run: ollama serve`;
  }
}

/** Check if Claude Code has auto-memory explicitly disabled */
function isAutoMemoryDisabled(): boolean {
  const settingsPath = path.join(process.env.HOME || process.env.USERPROFILE || '', '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) { return false; }
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return settings.autoMemoryEnabled === false;
  } catch {
    return false;
  }
}

/** Get default-selected platform values (detected ones) */
function getDetectedPlatforms(items: MultiSelectItem[]): string[] {
  return items.filter(i => i.hint?.includes('✓')).map(i => i.value);
}

type Step =
  | 'project-name'
  | 'project-dir'
  | 'capture-provider'
  | 'capture-key'
  | 'capture-base-url'
  | 'capture-model'
  | 'platforms'
  | 'auto-memory-check'
  | 'workspace-remote'
  | 'workspace-local-path'
  | 'search-engine'
  | 'embedding-provider'
  | 'ollama-url'
  | 'ollama-model'
  | 'embedding-key'
  | 'reranker'
  | 'reranker-provider'
  | 'reranker-key'
  | 'done';

interface OnboardingState {
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
  collectedKeys: Record<string, string>;
}

async function runSetup(state: OnboardingState, gitRoot: string): Promise<{ lines: string[]; autoMemoryWarning: boolean }> {
  const repoRoot = path.join(gitRoot, state.projectDir);
  const summaryLines: string[] = [];
  let autoMemoryWarning = false;

  // 1. Init config
  initConfig(repoRoot, state.projectName);

  // 1a. Write capture config if a provider was selected
  if (state.captureProvider) {
    const DEFAULT_CAPTURE_MODEL: Record<string, string> = {
      anthropic: 'claude-haiku-4-5', openai: 'gpt-4o-mini',
      gemini: 'gemini-2.0-flash', openrouter: 'openai/gpt-4o-mini', ollama: 'llama3.2',
    };
    const config = loadConfig(repoRoot);
    config.capture = {
      provider: state.captureProvider as import('../types').CaptureProviderName,
      model: state.captureModel || DEFAULT_CAPTURE_MODEL[state.captureProvider] || 'unknown',
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
    if (state.embeddingProvider === 'ollama') {
      const rawUrl = (state.embeddingUrl || 'http://localhost:11434').replace(/\/v1\/?$/, '').replace(/\/$/, '');
      // Normalize for OpenAI-compatible SDK: always store with /v1 suffix.
      const ollamaUrl = rawUrl + '/v1';
      const ollamaModel = state.embeddingModel || 'mxbai-embed-large';
      config.embedding.provider = 'ollama';
      config.embedding.base_url = ollamaUrl;
      config.embedding.model = ollamaModel;
      config.embedding.dimensions = 1024;
      // Test connectivity using the base URL (without /v1) via Ollama's native API.
      const ollamaErr = await testOllamaConnection(rawUrl, ollamaModel);
      if (ollamaErr) {
        summaryLines.push(`⚠  Ollama: ${ollamaErr}`);
      } else {
        summaryLines.push(`✓ Ollama connected, model "${ollamaModel}" ready`);
      }
    } else if (state.embeddingProvider === 'openai') {
      config.embedding.provider = 'openai';
      config.embedding.model = 'text-embedding-3-small';
      config.embedding.dimensions = 1536;
    } else if (state.embeddingProvider === 'jina') {
      config.embedding.provider = 'jina';
      config.embedding.model = 'jina-embeddings-v3';
      config.embedding.dimensions = 1024;
    }
    writeConfig(repoRoot, config);
  }

  if (state.enableReranker && state.rerankerProvider) {
    const config = loadConfig(repoRoot);
    config.reranker = {
      enabled: true,
      provider: state.rerankerProvider as 'jina' | 'cohere',
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

  // Ensure .env is gitignored inside .memobank/
  const gitignorePath = path.join(repoRoot, '.gitignore');
  const existingGitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  if (!existingGitignore.includes('.env')) {
    fs.writeFileSync(
      gitignorePath,
      existingGitignore + (existingGitignore.endsWith('\n') ? '' : '\n') + '.env\n',
      'utf-8'
    );
  }

  // Auto-run code indexing so recall --code works immediately after setup.
  try {
    await codeScanCommand(undefined, { summarize: true, repo: repoRoot });
    summaryLines.push('✓ Code index built');
  } catch {
    summaryLines.push('  Tip: run memo index-code to enable code-aware recall');
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

  const FALLBACK_MODELS: Record<string, string[]> = {
    anthropic:  ['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5'],
    openai:     ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    gemini:     ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    openrouter: ['openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku', 'google/gemini-2.0-flash'],
    ollama:     ['llama3.2', 'llama3.1', 'mistral', 'phi4'],
  };

  async function fetchModelsForOnboarding(
    provider: string,
    apiKey?: string,
    baseUrl?: string
  ): Promise<SelectItem[]> {
    const models = await fetchAvailableModels(provider as CaptureProviderName, apiKey, baseUrl);
    const list = models.length > 0 ? models : (FALLBACK_MODELS[provider] ?? []);
    return list.map((m) => ({ label: m, value: m }));
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
      collectedKeys: {},
    });
    const [nameInput, setNameInput] = useState(defaultName);
    const [projectDirInput, setProjectDirInput] = useState('.memobank');
    const [captureKeyInput, setCaptureKeyInput] = useState('');
    const [captureBaseUrlInput, setCaptureBaseUrlInput] = useState('');
    const [captureModelItems, setCaptureModelItems] = useState<SelectItem[]>([]);
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
          items: [
            { label: 'Anthropic (Claude)', value: 'anthropic' },
            { label: 'OpenAI', value: 'openai' },
            { label: 'OpenRouter (access 200+ models)', value: 'openrouter' },
            { label: 'Ollama (local, no API key)', value: 'ollama' },
            { label: 'Gemini (Google)', value: 'gemini' },
          ],
          onSelect: (item: { label: string; value: unknown }) => {
            const provider = String(item.value);
            setState(s => ({
              ...s,
              captureProvider: provider,
              step: provider === 'ollama' ? 'capture-base-url' : 'capture-key',
            }));
          },
        }),
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
            const envKey =
              state.captureProvider === 'anthropic'  ? 'ANTHROPIC_API_KEY' :
              state.captureProvider === 'openrouter' ? 'OPENROUTER_API_KEY' :
              state.captureProvider === 'gemini'     ? 'GEMINI_API_KEY' :
              'OPENAI_API_KEY';
            if (state.captureProvider === 'openrouter') {
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
        React.createElement(Text, { dimColor: true },
          state.captureProvider === 'ollama'
            ? '  Ollama endpoint (default: http://localhost:11434/v1)'
            : '  OpenRouter endpoint (default: https://openrouter.ai/api/v1)'
        ),
        React.createElement(TextInput, {
          value: captureBaseUrlInput ||
            (state.captureProvider === 'ollama' ? 'http://localhost:11434/v1' : 'https://openrouter.ai/api/v1'),
          onChange: setCaptureBaseUrlInput,
          onSubmit: async (value: string) => {
            const baseUrl = value.trim() ||
              (state.captureProvider === 'ollama' ? 'http://localhost:11434/v1' : 'https://openrouter.ai/api/v1');
            const apiKey = state.captureProvider === 'openrouter'
              ? state.collectedKeys['OPENROUTER_API_KEY']
              : undefined;
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
              React.createElement(Text, { dimColor: true }, '  (type model name and press Enter)'),
              React.createElement(TextInput, {
                value: '',
                onChange: () => {},
                onSubmit: (value: string) => {
                  const model = value.trim() || (FALLBACK_MODELS[state.captureProvider]?.[0] ?? '');
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
          items: [
            { label: 'Ollama (local, no API key needed)', value: 'ollama' },
            { label: 'OpenAI (cloud, requires API key)', value: 'openai' },
            { label: 'Jina AI (cloud, requires API key)', value: 'jina' },
          ],
          onSelect: (item: { label: string; value: unknown }) => {
            const provider = String(item.value);
            const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'JINA_API_KEY';
            const alreadyHaveKey = provider !== 'ollama' && Boolean(state.collectedKeys[envKey]);
            setState(s => ({
              ...s,
              embeddingProvider: provider,
              step: provider === 'ollama' ? 'ollama-url' : alreadyHaveKey ? 'reranker' : 'embedding-key',
            }));
          },
        }),
      ) : null,

      state.step === 'ollama-url' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null, 'Ollama base URL:'),
        React.createElement(Text, { dimColor: true }, '  (default: http://localhost:11434 — press Enter to confirm)'),
        React.createElement(TextInput, {
          value: ollamaUrlInput,
          onChange: setOllamaUrlInput,
          onSubmit: (value: string) => {
            setState(s => ({ ...s, step: 'ollama-model', embeddingUrl: value || 'http://localhost:11434' }));
          },
        }),
      ) : null,

      state.step === 'ollama-model' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null, 'Ollama embedding model:'),
        React.createElement(Text, { dimColor: true }, '  (default: mxbai-embed-large — run `ollama pull mxbai-embed-large` to install)'),
        React.createElement(TextInput, {
          value: ollamaModelInput,
          onChange: setOllamaModelInput,
          onSubmit: (value: string) => {
            setState(s => ({ ...s, step: 'reranker', embeddingModel: value || 'mxbai-embed-large' }));
          },
        }),
      ) : null,

      state.step === 'embedding-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true },
          `${state.embeddingProvider === 'openai' ? 'OpenAI' : 'Jina AI'} API key (for embeddings)`
        ),
        React.createElement(Text, { dimColor: true }, '  Saved to .memobank/.env — press Enter to skip'),
        React.createElement(TextInput, {
          value: embeddingKeyInput,
          onChange: setEmbeddingKeyInput,
          onSubmit: (value: string) => {
            const key = value.trim();
            const envKey = state.embeddingProvider === 'openai' ? 'OPENAI_API_KEY' : 'JINA_API_KEY';
            setState(s => ({
              ...s,
              step: 'reranker',
              collectedKeys: key ? { ...s.collectedKeys, [envKey]: key } : s.collectedKeys,
            }));
          },
        }),
      ) : null,

      state.step === 'reranker' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Enable reranker?'),
        React.createElement(Text, { dimColor: true }, '  Re-ranks results with AI for better precision (needs Jina or Cohere API key)'),
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

      state.step === 'reranker-provider' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, 'Reranker provider:'),
        React.createElement(SelectInput, {
          items: [
            { label: 'Jina AI', value: 'jina' },
            { label: 'Cohere', value: 'cohere' },
          ],
          onSelect: (item: { label: string; value: unknown }) => {
            const provider = String(item.value);
            const keyVar = provider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY';
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

      state.step === 'reranker-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, `${state.rerankerProvider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY'}:`),
        React.createElement(Text, { dimColor: true }, '  Saved to .memobank/.env — press Enter to skip'),
        React.createElement(TextInput, {
          value: rerankerKeyInput,
          onChange: setRerankerKeyInput,
          onSubmit: (value: string) => {
            if (setupRunning.current) return;
            setupRunning.current = true;
            const key = value.trim();
            const keyVar = state.rerankerProvider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY';
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
