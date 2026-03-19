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
import { execSync } from 'child_process';
import { findRepoRoot, getPersonalDir, migrateToPersonal } from '../core/store';
import { loadConfig, writeConfig, initConfig } from '../config';
import { installClaudeCode } from '../platforms/claude-code';
import { installCodex } from '../platforms/codex';
import { installGemini, detectGemini } from '../platforms/gemini';
import { installQwen, detectQwen } from '../platforms/qwen';
import { installCursor } from '../platforms/cursor';
import { teamInit } from './team';
interface MultiSelectItem {
  label: string;
  value: string;
  hint?: string;
  disabled?: boolean;
}

/** Detect git repo name from cwd */
function detectProjectName(): string {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8', stdio: 'pipe',
    }).trim();
    return path.basename(result);
  } catch {
    return path.basename(process.cwd());
  }
}

/** Detect which platforms are installed */
function detectPlatforms(): MultiSelectItem[] {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const isInPath = (cmd: string): boolean => {
    try { execSync(`which ${cmd}`, { stdio: 'pipe' }); return true; } catch { return false; }
  };

  return [
    {
      label: 'Claude Code',
      value: 'claude-code',
      hint: fs.existsSync(path.join(home, '.claude', 'settings.json')) ? '✓ detected' : 'not found',
      disabled: false,
    },
    {
      label: 'Codex',
      value: 'codex',
      hint: isInPath('codex') ? '✓ detected' : 'not found',
    },
    {
      label: 'Gemini CLI',
      value: 'gemini',
      hint: detectGemini() ? '✓ detected' : 'not found',
    },
    {
      label: 'Qwen Code',
      value: 'qwen',
      hint: detectQwen() ? '✓ detected' : 'not found',
    },
    {
      label: 'Cursor',
      value: 'cursor',
      hint: fs.existsSync(path.join(process.cwd(), '.cursor')) ? '✓ detected' : 'not found',
    },
  ];
}

/** Get default-selected platform values (detected ones) */
function getDetectedPlatforms(items: MultiSelectItem[]): string[] {
  return items.filter(i => i.hint?.includes('✓')).map(i => i.value);
}

type Step = 'project-name' | 'platforms' | 'team-repo' | 'search-engine' | 'embedding-provider' | 'ollama-url' | 'openai-key' | 'jina-key' | 'reranker' | 'reranker-provider' | 'done';

interface OnboardingState {
  step: Step;
  projectName: string;
  platforms: string[];
  teamRepo: string;
  searchEngine: string;
  embeddingProvider: string;
  embeddingUrl: string;
  embeddingApiKey: string;
  enableReranker: boolean;
  rerankerProvider: string;
}

async function runSetup(state: OnboardingState, repoRoot: string): Promise<string[]> {
  const summaryLines: string[] = [];

  // 1. Init config
  initConfig(repoRoot, state.projectName);

  // 2. Create personal/ directory structure
  const personalDir = getPersonalDir(repoRoot);
  const TYPES = ['lesson', 'decision', 'workflow', 'architecture'];
  for (const type of TYPES) {
    fs.mkdirSync(path.join(personalDir, type), { recursive: true });
  }
  fs.mkdirSync(path.join(repoRoot, 'memory'), { recursive: true });

  // 3. Migrate existing root-level memories
  const { migrated, skipped } = migrateToPersonal(repoRoot);
  if (migrated.length > 0) { summaryLines.push(`Migrated ${migrated.length} existing memories to personal/`); }
  if (skipped.length > 0) { summaryLines.push(`Skipped ${skipped.length} files (conflict) — resolve manually`); }

  summaryLines.push(`Personal memories: ${personalDir}`);

  // 4. Install platform adapters
  for (const platform of state.platforms) {
    switch (platform) {
      case 'claude-code': await installClaudeCode(repoRoot); break;
      case 'codex': await installCodex(process.cwd()); break;
      case 'gemini': await installGemini(); break;
      case 'qwen': await installQwen(); break;
      case 'cursor': await installCursor(process.cwd()); break;
    }
  }
  if (state.platforms.length > 0) {
    summaryLines.push(`Platforms: ${state.platforms.join(', ')}`);
  }

  // 5. Set up team repo if provided
  if (state.teamRepo.trim()) {
    try {
      await teamInit(state.teamRepo.trim(), repoRoot);
      summaryLines.push(`Team repo: linked`);
    } catch (e) {
      summaryLines.push(`Team repo: setup failed — ${(e as Error).message}`);
    }
  }

  // 6. Update engine config if lancedb
  if (state.searchEngine === 'lancedb') {
    const config = loadConfig(repoRoot);
    config.embedding.engine = 'lancedb';
    if (state.embeddingProvider === 'ollama') {
      config.embedding.provider = 'ollama';
      config.embedding.base_url = state.embeddingUrl || 'http://localhost:11434';
      config.embedding.model = 'mxbai-embed-large';
      config.embedding.dimensions = 1024;
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
    summaryLines.push(`Reranker: ${state.rerankerProvider} (set ${keyVar} env var)`);
  }

  return summaryLines;
}

export async function onboardingCommand(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());

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
      platforms: detectedPlatforms,
      teamRepo: '',
      searchEngine: 'text',
      embeddingProvider: '',
      embeddingUrl: 'http://localhost:11434',
      embeddingApiKey: '',
      enableReranker: false,
      rerankerProvider: '',
    });
    const [nameInput, setNameInput] = useState(defaultName);
    const [teamInput, setTeamInput] = useState('');
    const [ollamaUrlInput, setOllamaUrlInput] = useState('http://localhost:11434');
    const [openaiKeyInput, setOpenaiKeyInput] = useState('');
    const [jinaKeyInput, setJinaKeyInput] = useState('');
    const [done, setDone] = useState(false);
    const [summary, setSummary] = useState<string[]>([]);
    // Prevent double-submission
    const setupRunning = useRef(false);

    if (done) {
      return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, { color: 'green', bold: true }, '✓ memobank initialized!'),
        ...summary.map((line, i) => React.createElement(Text, { key: i, dimColor: true }, `  ${line}`)),
        React.createElement(Text, { dimColor: true }, 'Run: memo recall "anything" to test'),
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
            setState(s => ({ ...s, step: 'platforms', projectName: value || defaultName }));
          },
        }),
      ) : null,

      state.step === 'platforms' ? React.createElement(InlineMultiSelect, {
        label: 'Select platforms to integrate:',
        items: platformItems,
        defaultSelected: detectedPlatforms,
        onSubmit: (selected: string[]) => {
          setState(s => ({ ...s, step: 'team-repo', platforms: selected }));
        },
      }) : null,

      state.step === 'team-repo' ? React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, null,
          'Team memory repo ',
          React.createElement(Text, { dimColor: true }, '(optional — Enter to skip):'),
        ),
        React.createElement(TextInput, {
          value: teamInput,
          onChange: setTeamInput,
          onSubmit: (value: string) => {
            setState(s => ({ ...s, step: 'search-engine', teamRepo: value }));
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
            setState(s => ({ ...s, step: 'reranker', embeddingUrl: value || 'http://localhost:11434' }));
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
              runSetup(finalState, repoRoot).then(lines => {
                setSummary(lines);
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
            { label: 'Jina AI  (set JINA_API_KEY)', value: 'jina' },
            { label: 'Cohere   (set COHERE_API_KEY)', value: 'cohere' },
          ],
          onSelect: (item: { label: string; value: unknown }) => {
            if (setupRunning.current) return;
            setupRunning.current = true;
            const finalState = { ...state, step: 'done' as Step, enableReranker: true, rerankerProvider: String(item.value) };
            setState(finalState);
            runSetup(finalState, repoRoot).then(lines => {
              setSummary(lines);
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
