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

type Step = 'project-name' | 'project-dir' | 'platforms' | 'auto-memory-check' | 'workspace-remote' | 'search-engine' | 'embedding-provider' | 'ollama-url' | 'ollama-model' | 'openai-key' | 'jina-key' | 'reranker' | 'reranker-provider' | 'reranker-key' | 'done';

interface OnboardingState {
  step: Step;
  projectName: string;
  projectDir: string;
  platforms: string[];
  enableAutoMemory: boolean;
  workspaceRemote: string;
  searchEngine: string;
  embeddingProvider: string;
  embeddingUrl: string;
  embeddingModel: string;
  embeddingApiKey: string;
  enableReranker: boolean;
  rerankerProvider: string;
  rerankerApiKey: string;
}

async function runSetup(state: OnboardingState, gitRoot: string): Promise<{ lines: string[]; autoMemoryWarning: boolean }> {
  const repoRoot = path.join(gitRoot, state.projectDir);
  const summaryLines: string[] = [];
  let autoMemoryWarning = false;

  // 1. Init config
  initConfig(repoRoot, state.projectName);

  // 2. Create directory structure
  const TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
  for (const type of TYPES) {
    fs.mkdirSync(path.join(repoRoot, type), { recursive: true });
  }

  summaryLines.push(`Memories: ${repoRoot}`);

  // 3. Initialize workspace remote if provided
  if (state.workspaceRemote.trim()) {
    try {
      await workspaceInit(state.workspaceRemote.trim(), repoRoot);
      summaryLines.push(`Workspace: ${state.workspaceRemote.trim()}`);
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
      // Save API key to env file (not config.yaml for security)
      if (state.embeddingApiKey.trim()) {
        const envPath = path.join(repoRoot, '.env');
        const envLine = `OPENAI_API_KEY=${state.embeddingApiKey.trim()}\n`;
        const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        if (!existing.includes('OPENAI_API_KEY=')) {
          fs.writeFileSync(envPath, existing + envLine, 'utf-8');
          summaryLines.push(`OpenAI API key saved to ${envPath}`);
        }
      }
    } else if (state.embeddingProvider === 'jina') {
      config.embedding.provider = 'jina';
      config.embedding.model = 'jina-embeddings-v3';
      config.embedding.dimensions = 1024;
      if (state.embeddingApiKey.trim()) {
        const envPath = path.join(repoRoot, '.env');
        const envLine = `JINA_API_KEY=${state.embeddingApiKey.trim()}\n`;
        const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
        if (!existing.includes('JINA_API_KEY=')) {
          fs.writeFileSync(envPath, existing + envLine, 'utf-8');
          summaryLines.push(`Jina API key saved to ${envPath}`);
        }
      }
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
    const keyVar = state.rerankerProvider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY';
    if (state.rerankerApiKey.trim()) {
      const envPath = path.join(repoRoot, '.env');
      const envLine = `${keyVar}=${state.rerankerApiKey.trim()}\n`;
      const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
      if (!existing.includes(`${keyVar}=`)) {
        fs.writeFileSync(envPath, existing + envLine, 'utf-8');
        summaryLines.push(`✓ Reranker: ${state.rerankerProvider} (${keyVar} saved to .env)`);
      } else {
        summaryLines.push(`✓ Reranker: ${state.rerankerProvider} (${keyVar} already in .env)`);
      }
    } else {
      summaryLines.push(`Reranker: ${state.rerankerProvider} (set ${keyVar} env var)`);
    }
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

  function OnboardingApp() {
    const [state, setState] = useState<OnboardingState>({
      step: 'project-name',
      projectName: defaultName,
      projectDir: '.memobank',
      platforms: detectedPlatforms,
      enableAutoMemory: true,
      workspaceRemote: '',
      searchEngine: 'text',
      embeddingProvider: '',
      embeddingUrl: 'http://localhost:11434',
      embeddingModel: 'mxbai-embed-large',
      embeddingApiKey: '',
      enableReranker: false,
      rerankerProvider: '',
      rerankerApiKey: '',
    });
    const [nameInput, setNameInput] = useState(defaultName);
    const [projectDirInput, setProjectDirInput] = useState('.memobank');
    const [workspaceInput, setWorkspaceInput] = useState('');
    const [ollamaUrlInput, setOllamaUrlInput] = useState('http://localhost:11434');
    const [ollamaModelInput, setOllamaModelInput] = useState('mxbai-embed-large');
    const [openaiKeyInput, setOpenaiKeyInput] = useState('');
    const [rerankerKeyInput, setRerankerKeyInput] = useState('');
    const [jinaKeyInput, setJinaKeyInput] = useState('');
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
            setState(s => ({ ...s, step: 'platforms', projectDir: dir }));
          },
        }),
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
            setState(s => ({ ...s, step: 'search-engine', workspaceRemote: value }));
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
            if (provider === 'ollama') {
              setState(s => ({ ...s, step: 'ollama-url', embeddingProvider: provider }));
            } else if (provider === 'openai') {
              setState(s => ({ ...s, step: 'openai-key', embeddingProvider: provider }));
            } else {
              setState(s => ({ ...s, step: 'jina-key', embeddingProvider: provider }));
            }
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

      state.step === 'openai-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null, 'OpenAI API key:'),
        React.createElement(Text, { dimColor: true }, '  (will be saved to .env — press Enter to skip and set OPENAI_API_KEY manually)'),
        React.createElement(TextInput, {
          value: openaiKeyInput,
          onChange: setOpenaiKeyInput,
          onSubmit: (value: string) => {
            setState(s => ({ ...s, step: 'reranker', embeddingApiKey: value }));
          },
        }),
      ) : null,

      state.step === 'jina-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null, 'Jina API key:'),
        React.createElement(Text, { dimColor: true }, '  (will be saved to .env — press Enter to skip and set JINA_API_KEY manually)'),
        React.createElement(TextInput, {
          value: jinaKeyInput,
          onChange: setJinaKeyInput,
          onSubmit: (value: string) => {
            setState(s => ({ ...s, step: 'reranker', embeddingApiKey: value }));
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
            setState(s => ({ ...s, step: 'reranker-key', enableReranker: true, rerankerProvider: String(item.value) }));
          },
        }),
      ) : null,

      state.step === 'reranker-key' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true }, `${state.rerankerProvider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY'}:`),
        React.createElement(Text, { dimColor: true }, '  Paste your API key (leave empty to set later via env var)'),
        React.createElement(TextInput, {
          value: rerankerKeyInput,
          onChange: setRerankerKeyInput,
          onSubmit: (value: string) => {
            if (setupRunning.current) return;
            setupRunning.current = true;
            const finalState = { ...state, step: 'done' as Step, rerankerApiKey: value.trim() };
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
