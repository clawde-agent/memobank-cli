# Capture Provider Multi-LLM Support & API Key Collection — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend smart-extractor to support multiple LLM providers (Anthropic, OpenAI, Gemini, OpenRouter, Ollama), collect API keys contextually during onboarding, and store them in `.memobank/.env`.

**Architecture:** `smart-extractor.ts` becomes provider-agnostic (mirroring `embedding.ts` pattern). A new `capture` section in `meta/config.yaml` holds the provider and model. Onboarding gains 4 new steps to collect capture provider, key, base-url, and model (with API-fetched model lists). All API keys are consolidated into `.memobank/.env` (gitignored) and loaded at CLI startup via `dotenv`.

**Tech Stack:** TypeScript 5.3, Node 18+, Jest, OpenAI SDK (already present as optional dep — moved to required), `dotenv` (new), `@google/generative-ai` (optional — user installs if they pick Gemini), Ink/React (existing onboarding TUI).

**Spec:** `docs/superpowers/specs/2026-03-20-capture-provider-api-keys-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/types.ts` | Modify | Add `CaptureProvider`, `CaptureConfig`; add `capture?` to `MemoConfig` |
| `src/config.ts` | Modify | Add `capture` field to `DEFAULT_CONFIG`, load/write it |
| `src/cli.ts` | Modify | Add `dotenv` load before any command registration |
| `src/core/smart-extractor.ts` | Rewrite | `CaptureConfig` interface, multi-provider `extract()`, `captureConfigFromMemoConfig()`, `fetchAvailableModels()`, dead code removal |
| `src/commands/capture.ts` | Modify | Remove dead noise-filter imports, use new `extract(text, config)` signature, add null guard |
| `src/commands/onboarding.tsx` | Modify | Add 4 capture steps + embedding-key + reranker-key steps, consolidate all .env writes to done step, remove dead `api-key` Step |
| `package.json` | Modify | Move `openai` from optionalDependencies → dependencies; add `dotenv` |
| `tests/smart-extractor.test.ts` | Create | Unit tests for `captureConfigFromMemoConfig` and `fetchAvailableModels` |
| `tests/config.test.ts` | Modify | Add tests for capture field load/write |

---

## Chunk 1: Foundation — types, config, dotenv, dependencies

### Task 1: Move `openai` to dependencies and add `dotenv`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dotenv and move openai**

```bash
cd /home/ubuntu/.openclaw/workspace-code/memobank-cli
npm install dotenv
npm install openai@^4.104.0
```

Expected: `dotenv` appears in `dependencies`; `openai` moves from `optionalDependencies` to `dependencies` (pinned to `^4.104.0`) in `package.json`.

- [ ] **Step 2: Verify package.json**

```bash
grep -A2 '"dotenv"' package.json
grep -A2 '"openai"' package.json
```

Expected: `dotenv` in `dependencies`, `openai` in `dependencies` (not `optionalDependencies`).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add dotenv dep, move openai to required dependencies"
```

---

### Task 2: Add CaptureProvider and CaptureConfig types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add types to `src/types.ts`**

Add after the `Engine` type (line 2):

```typescript
export type CaptureProvider = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';
```

Add a new `CaptureConfig` interface after `WorkspaceConfig`:

```typescript
export interface CaptureConfig {
  provider: CaptureProvider;
  model: string;
  apiKey?: string;    // undefined for ollama
  baseUrl?: string;   // custom endpoint for openrouter / ollama
}
```

Add `capture?` field to `MemoConfig` (after `reranker?`):

```typescript
  capture?: {
    provider: CaptureProvider;
    model?: string;
    base_url?: string;
  };
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add CaptureProvider, CaptureConfig types and MemoConfig.capture field"
```

---

### Task 3: Add capture field to config.ts and write tests

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Write failing tests for capture config**

Add to `tests/config.test.ts`:

```typescript
describe('capture config', () => {
  it('loads default capture config when not present in yaml', () => {
    const repo = makeTempRepo();
    fs.writeFileSync(path.join(repo, 'meta', 'config.yaml'), 'project:\n  name: test\n');
    const config = loadConfig(repo);
    expect(config.capture).toBeUndefined();
    fs.rmSync(repo, { recursive: true });
  });

  it('loads capture provider and model from yaml', () => {
    const repo = makeTempRepo();
    fs.writeFileSync(
      path.join(repo, 'meta', 'config.yaml'),
      'project:\n  name: test\ncapture:\n  provider: openai\n  model: gpt-4o-mini\n'
    );
    const config = loadConfig(repo);
    expect(config.capture?.provider).toBe('openai');
    expect(config.capture?.model).toBe('gpt-4o-mini');
    fs.rmSync(repo, { recursive: true });
  });

  it('writeConfig round-trips capture field', () => {
    const repo = makeTempRepo();
    const base = loadConfig(repo);
    base.capture = { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' };
    writeConfig(repo, base);
    const reloaded = loadConfig(repo);
    expect(reloaded.capture?.provider).toBe('anthropic');
    expect(reloaded.capture?.model).toBe('claude-3-5-haiku-20241022');
    fs.rmSync(repo, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/config.test.ts -t "capture config" -v
```

Expected: FAIL — `capture` field not yet in `loadConfig`.

- [ ] **Step 3: Update `src/config.ts` to load/write capture**

In `loadConfig`, add capture to the returned object (after `reranker`):

```typescript
...(loaded?.capture ? { capture: loaded.capture } : {}),
```

- [ ] **Step 4: Run tests — should pass**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/config.test.ts -v
```

Expected: All tests PASS (including existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add capture field to config load/write + tests"
```

---

### Task 4: Add dotenv load to cli.ts

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Add dotenv load to cli.ts**

`src/cli.ts` already imports `* as path from 'path'` (line 29). Add only the `dotenv` import alongside the existing imports at the top:

```typescript
import * as dotenv from 'dotenv';
```

Then add this line before `const program = new Command();` (currently line 31):

```typescript
// Load project .memobank/.env if present; system env vars take precedence
dotenv.config({ path: path.join(process.cwd(), '.memobank', '.env'), override: false });
```

Do NOT add a second `import * as path` — it already exists.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Smoke test**

```bash
npm run build && node dist/cli.js --version
```

Expected: Prints version (e.g., `0.5.0`), no errors.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "feat: load .memobank/.env at CLI startup via dotenv"
```

---

## Chunk 2: smart-extractor refactor + capture.ts cleanup

### Task 5: Write tests for `captureConfigFromMemoConfig`

**Files:**
- Create: `tests/smart-extractor.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { captureConfigFromMemoConfig, fetchAvailableModels } from '../src/core/smart-extractor';
import type { MemoConfig } from '../src/types';

// Minimal valid MemoConfig for tests
function makeConfig(overrides: Partial<MemoConfig> = {}): MemoConfig {
  return {
    project: { name: 'test' },
    memory: { token_budget: 500, top_k: 5 },
    embedding: { engine: 'text', provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
    search: { use_tags: true, use_summary: true },
    review: { enabled: true },
    ...overrides,
  };
}

describe('captureConfigFromMemoConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null when no capture config', () => {
    const result = captureConfigFromMemoConfig(makeConfig());
    expect(result).toBeNull();
  });

  it('returns null when provider configured but key missing (non-ollama)', () => {
    delete process.env.OPENAI_API_KEY;
    const result = captureConfigFromMemoConfig(makeConfig({
      capture: { provider: 'openai', model: 'gpt-4o-mini' },
    }));
    expect(result).toBeNull();
  });

  it('returns config when provider=ollama (no key required)', () => {
    const result = captureConfigFromMemoConfig(makeConfig({
      capture: { provider: 'ollama', model: 'llama3.2' },
    }));
    expect(result).not.toBeNull();
    expect(result?.provider).toBe('ollama');
    expect(result?.apiKey).toBeUndefined();
  });

  it('returns config with key from env when provider=anthropic', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const result = captureConfigFromMemoConfig(makeConfig({
      capture: { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
    }));
    expect(result?.provider).toBe('anthropic');
    expect(result?.apiKey).toBe('sk-ant-test');
    expect(result?.model).toBe('claude-3-5-haiku-20241022');
  });

  it('uses default model when model not set in config', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const result = captureConfigFromMemoConfig(makeConfig({
      capture: { provider: 'openai' },
    }));
    expect(result?.model).toBe('gpt-4o-mini');
  });

  it('passes through base_url for openrouter', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const result = captureConfigFromMemoConfig(makeConfig({
      capture: { provider: 'openrouter', model: 'openai/gpt-4o-mini', base_url: 'https://openrouter.ai/api/v1' },
    }));
    expect(result?.baseUrl).toBe('https://openrouter.ai/api/v1');
  });
});

describe('fetchAvailableModels', () => {
  it('returns anthropic curated list without any API call', async () => {
    const models = await fetchAvailableModels('anthropic');
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toBe('claude-3-5-haiku-20241022');
  });

  it('returns empty array when fetch throws (graceful fallback)', async () => {
    // fetchAvailableModels should never throw — always returns [] on failure
    const models = await fetchAvailableModels('openai', 'bad-key');
    // Either returns [] (network error) or a list — both are valid
    expect(Array.isArray(models)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to see failure**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/smart-extractor.test.ts -v
```

Expected: FAIL — `captureConfigFromMemoConfig` and `fetchAvailableModels` not exported yet.

---

### Task 6: Rewrite `src/core/smart-extractor.ts`

**Files:**
- Rewrite: `src/core/smart-extractor.ts`

- [ ] **Step 1: Replace the file contents**

```typescript
/**
 * Smart Extractor — multi-provider LLM extraction for memo capture
 * Supports: anthropic, openai, openrouter, ollama (via OpenAI SDK), gemini
 */

import type { ExtractionResult, MemoConfig, CaptureConfig, CaptureProvider } from '../types';

// ── Default models per provider ──────────────────────────────────────────────

const DEFAULT_MODELS: Record<CaptureProvider, string> = {
  anthropic:  'claude-3-5-haiku-20241022',
  openai:     'gpt-4o-mini',
  gemini:     'gemini-2.0-flash',
  openrouter: 'openai/gpt-4o-mini',
  ollama:     'llama3.2',
};

// ── Env var names per provider ────────────────────────────────────────────────

const ENV_KEYS: Partial<Record<CaptureProvider, string>> = {
  anthropic:  'ANTHROPIC_API_KEY',
  openai:     'OPENAI_API_KEY',
  gemini:     'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  // ollama: no key needed
};

// ── System prompt (shared across all providers) ───────────────────────────────

const SYSTEM_PROMPT = `You extract structured memories from AI coding session summaries.
Return a JSON array. Each item:
{
  "name": "slug-format",
  "type": "lesson|decision|workflow|architecture",
  "description": "one sentence summary",
  "tags": ["tag1", "tag2"],
  "confidence": "low|medium|high",
  "content": "markdown body with the full insight"
}

Extract only significant learnings (architectural decisions, bug root causes, patterns, trade-offs).
Skip trivial actions (file saves, test runs, greetings). Max 3 items per session.`;

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Build a CaptureConfig from meta/config.yaml + process.env.
 * Returns null if the provider is not configured or the required key is missing.
 */
export function captureConfigFromMemoConfig(config: MemoConfig): CaptureConfig | null {
  if (!config.capture?.provider) return null;

  const provider = config.capture.provider as CaptureProvider;
  const model = config.capture.model ?? DEFAULT_MODELS[provider];
  const baseUrl = config.capture.base_url;

  // Ollama needs no API key
  if (provider === 'ollama') {
    return { provider, model, baseUrl };
  }

  const envKey = ENV_KEYS[provider];
  const apiKey = envKey ? process.env[envKey] : undefined;
  if (!apiKey) return null;

  return { provider, model, apiKey, baseUrl };
}

// ── Model listing (used by onboarding) ───────────────────────────────────────

const ANTHROPIC_CURATED = [
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5',
];

/**
 * Fetch available models for a provider.
 * Returns a curated list for Anthropic (no API) and an empty array on any fetch failure.
 * Never throws.
 */
export async function fetchAvailableModels(
  provider: CaptureProvider,
  apiKey?: string,
  baseUrl?: string
): Promise<string[]> {
  try {
    if (provider === 'anthropic') return ANTHROPIC_CURATED;

    if (provider === 'ollama') {
      // Strip /v1 suffix if present — Ollama's tags API lives at the root, not under /v1
      const base = (baseUrl ?? 'http://localhost:11434').replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) return [];
      const data = await res.json() as { models?: { name: string }[] };
      return (data.models ?? []).map((m: { name: string }) => m.name);
    }

    if (provider === 'gemini') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (!res.ok) return [];
      const data = await res.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      return (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace('models/', ''));
    }

    // openai / openrouter / custom — OpenAI-compatible /v1/models endpoint
    const base = baseUrl ?? (provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.openai.com/v1');
    const res = await fetch(`${base.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as { data?: { id: string; context_length?: number }[] };
    const models = data.data ?? [];

    if (provider === 'openrouter') {
      // Sort by context_length descending, take top 20
      return models
        .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
        .slice(0, 20)
        .map((m) => m.id);
    }

    // openai: filter to gpt-* and o1/o3 models
    return models
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d)/.test(id))
      .sort();
  } catch {
    return [];
  }
}

// ── Extract ────────────────────────────────────────────────────────────────────

/**
 * Extract memories from session text using the configured LLM provider.
 */
export async function extract(
  sessionText: string,
  config: CaptureConfig
): Promise<ExtractionResult[]> {
  try {
    const raw = await callLLM(sessionText, config);
    return parseExtractionResult(raw);
  } catch (error) {
    console.error(`LLM extraction error: ${(error as Error).message}`);
    return [];
  }
}

// ── Provider dispatch ─────────────────────────────────────────────────────────

async function callLLM(sessionText: string, config: CaptureConfig): Promise<string> {
  const userMessage = `Extract memories from this session:\n\n${sessionText}`;

  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(userMessage, config);
    case 'gemini':
      return callGemini(userMessage, config);
    default:
      // openai, openrouter, ollama — all OpenAI-compatible
      return callOpenAICompatible(userMessage, config);
  }
}

async function callAnthropic(userMessage: string, config: CaptureConfig): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as { content: { text: string }[] };
  return data.content[0]?.text ?? '';
}

async function callOpenAICompatible(userMessage: string, config: CaptureConfig): Promise<string> {
  // Dynamic import — openai is a regular dep but we isolate for testability
  const { OpenAI } = await import('openai');

  const baseUrl = config.baseUrl ?? (
    config.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
    config.provider === 'ollama'     ? 'http://localhost:11434/v1' :
    undefined
  );

  const client = new OpenAI({
    apiKey: config.apiKey ?? 'ollama',
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  });

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 4096,
  });

  return response.choices[0]?.message?.content ?? '';
}

async function callGemini(userMessage: string, config: CaptureConfig): Promise<string> {
  let GoogleGenerativeAI: new (key: string) => { getGenerativeModel: (opts: { model: string }) => { generateContent: (opts: { systemInstruction: string; contents: { role: string; parts: { text: string }[] }[] }) => Promise<{ response: { text: () => string } }> } };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ({ GoogleGenerativeAI } = require('@google/generative-ai'));
  } catch {
    throw new Error('Gemini requires @google/generative-ai — run: npm install @google/generative-ai');
  }

  const genAI = new GoogleGenerativeAI(config.apiKey!);
  const model = genAI.getGenerativeModel({ model: config.model });
  const result = await model.generateContent({
    systemInstruction: SYSTEM_PROMPT,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
  });
  return result.response.text();
}

// ── Parse LLM output ──────────────────────────────────────────────────────────

function parseExtractionResult(raw: string): ExtractionResult[] {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ExtractionResult[];
    return parsed.filter(
      (item) =>
        item.name &&
        item.type &&
        item.description &&
        Array.isArray(item.tags) &&
        item.confidence &&
        item.content
    );
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Run the smart-extractor tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest tests/smart-extractor.test.ts -v
```

Expected: All tests PASS.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/smart-extractor.ts tests/smart-extractor.test.ts
git commit -m "feat: refactor smart-extractor to support multiple LLM providers"
```

---

### Task 7: Clean up `capture.ts` — remove dead imports, update extract call

**Files:**
- Modify: `src/commands/capture.ts`

- [ ] **Step 1: Update `capture.ts`**

**A. Fix the noise-filter import** (line 15-21). The current import includes dead symbols (`isNoise`, `hasHighValueIndicators`, `filterAndRank`). Replace the entire noise-filter import with only what's called in the function body:

```typescript
// BEFORE (line 15-21):
import {
  isNoise,
  hasHighValueIndicators,
  calculateValueScore,
  getCaptureRecommendation,
  filterAndRank,
} from '../core/noise-filter';

// AFTER:
import { calculateValueScore, getCaptureRecommendation } from '../core/noise-filter';
```

**B. Extend the existing smart-extractor import** (line 10). `extract` is already imported there — add `captureConfigFromMemoConfig` to the same import:

```typescript
// BEFORE (line 10):
import { extract } from '../core/smart-extractor';

// AFTER:
import { extract, captureConfigFromMemoConfig } from '../core/smart-extractor';
```

**C. Replace the `extract` call** (line 119). Replace:

```typescript
const extracted = await extract(sanitized, process.env.ANTHROPIC_API_KEY);
```

With:

```typescript
const captureConfig = captureConfigFromMemoConfig(config);
if (!captureConfig) {
  if (!isSilent) {
    console.warn('No capture provider configured. Run `memo onboarding` to set up a capture LLM.');
  }
  return;
}
const extracted = await extract(sanitized, captureConfig);
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Build and smoke test**

```bash
npm run build && node dist/cli.js capture --help
```

Expected: Prints capture command help, no errors.

- [ ] **Step 4: Run all tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest -v
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/capture.ts
git commit -m "fix: remove dead noise-filter imports from capture.ts, use new extract(text, config) signature"
```

---

## Chunk 3: Onboarding — capture steps + .env consolidation

### Task 8: Add capture state fields and helper to OnboardingState

**Files:**
- Modify: `src/commands/onboarding.tsx`

The onboarding file uses Ink (ESM-only), so there are no unit tests for the component itself. Test by running `memo onboarding` manually after implementation.

- [ ] **Step 1: Update the `Step` type**

Replace the `Step` type at line 113:

```typescript
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
  | 'search-engine'
  | 'embedding-provider'
  | 'ollama-url'
  | 'ollama-model'
  | 'embedding-key'
  | 'reranker'
  | 'reranker-provider'
  | 'reranker-key'
  | 'done';
// NOTE: 'openai-key', 'jina-key', 'api-key' are REMOVED (replaced by 'embedding-key' and 'reranker-key')
```

- [ ] **Step 2: Update `OnboardingState`**

Replace the `OnboardingState` interface:

```typescript
interface OnboardingState {
  step: Step;
  projectName: string;
  projectDir: string;
  // Capture
  captureProvider: string;
  captureModel: string;
  captureBaseUrl: string;
  // Platforms
  platforms: string[];
  enableAutoMemory: boolean;
  // Workspace
  workspaceRemote: string;
  // Search / embedding
  searchEngine: string;
  embeddingProvider: string;
  embeddingUrl: string;
  embeddingModel: string;
  // Reranker
  enableReranker: boolean;
  rerankerProvider: string;
  // All collected API keys (env var name → value)
  collectedKeys: Record<string, string>;
}
```

- [ ] **Step 3: Update initial state in `OnboardingApp`**

Replace the `useState<OnboardingState>` initial value:

```typescript
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
  searchEngine: 'text',
  embeddingProvider: '',
  embeddingUrl: 'http://localhost:11434',
  embeddingModel: 'mxbai-embed-large',
  enableReranker: false,
  rerankerProvider: '',
  collectedKeys: {},
});
```

- [ ] **Step 4: Replace old input state variables**

Remove the `openaiKeyInput` and `jinaKeyInput` state vars (currently lines 339–340 in `onboarding.tsx`) — they are replaced by `embeddingKeyInput`. Also remove `embeddingApiKey` from `OnboardingState` (it no longer exists after Step 2). Replace with:

```typescript
// REMOVE these two lines:
const [openaiKeyInput, setOpenaiKeyInput] = useState('');
const [jinaKeyInput, setJinaKeyInput] = useState('');

// ADD these instead:
const [captureKeyInput, setCaptureKeyInput] = useState('');
const [captureBaseUrlInput, setCaptureBaseUrlInput] = useState('');
const [rerankerKeyInput, setRerankerKeyInput] = useState('');
const [embeddingKeyInput, setEmbeddingKeyInput] = useState('');
const [captureModelItems, setCaptureModelItems] = useState<SelectItem[]>([]);
```

Also confirm `state.embeddingApiKey` is no longer referenced anywhere in the file after the `OnboardingState` replacement — `runSetup` had two references to it (lines 198–219) which Task 11 Step 1 removes. The typecheck in Step 6 will catch any missed reference.

- [ ] **Step 5a: Add `fetchAvailableModels` import at top of file**

At the top of `src/commands/onboarding.tsx`, alongside the other imports:

```typescript
import { fetchAvailableModels } from '../core/smart-extractor';
```

- [ ] **Step 5b: Add `fetchModelsForOnboarding` helper inside `onboardingCommand`**

Add before the `OnboardingApp` function definition. This helper calls `fetchAvailableModels` and returns fallback curated items if the list is empty:

```typescript
// (no separate import needed — fetchAvailableModels imported at file top in Step 5a)

// Helper: fetch models for the onboarding select list
const FALLBACK_MODELS: Record<string, string[]> = {
  anthropic:  ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022', 'claude-opus-4-5'],
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
  const models = await fetchAvailableModels(provider as import('../types').CaptureProvider, apiKey, baseUrl);
  const list = models.length > 0 ? models : (FALLBACK_MODELS[provider] ?? []);
  return list.map((m) => ({ label: m, value: m }));
}
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors (or only errors in the JSX that reference the not-yet-added steps).

---

### Task 9: Add capture-provider, capture-key, capture-base-url, capture-model steps

**Files:**
- Modify: `src/commands/onboarding.tsx`

- [ ] **Step 1: Add capture-provider step**

After the `project-dir` step rendering (after line ~389), add the capture-provider step. This goes in the main `return` inside `OnboardingApp`:

```typescript
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
```

- [ ] **Step 2: Add capture-key step**

> **Note:** Key validation (re-prompting on HTTP 4xx errors) is out of scope for this plan. The step accepts any non-empty string and proceeds — the key is validated implicitly when the model listing is fetched (an invalid key will produce an empty list → fallback to curated list). Full re-prompt-on-4xx can be added in a follow-up.

```typescript
state.step === 'capture-key' ? React.createElement(Box, { flexDirection: 'column' },
  React.createElement(Text, { bold: true }, `${state.captureProvider} API key`),
  React.createElement(Text, { dimColor: true }, '  Saved to .memobank/.env (not committed)'),
  React.createElement(TextInput, {
    value: captureKeyInput,
    onChange: setCaptureKeyInput,
    onSubmit: async (value: string) => {
      const key = value.trim();
      if (!key) return; // require non-empty key

      const envKey =
        state.captureProvider === 'anthropic'  ? 'ANTHROPIC_API_KEY' :
        state.captureProvider === 'openrouter' ? 'OPENROUTER_API_KEY' :
        state.captureProvider === 'gemini'     ? 'GEMINI_API_KEY' :
        'OPENAI_API_KEY';

      // openrouter needs base URL before model fetch — collect it next
      if (state.captureProvider === 'openrouter') {
        setState(s => ({
          ...s,
          step: 'capture-base-url',
          collectedKeys: { ...s.collectedKeys, [envKey]: key },
        }));
        return;
      }

      // For all other providers: fetch models now, then proceed
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
```

- [ ] **Step 3: Add capture-base-url step**

```typescript
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
        : undefined; // ollama has no key

      const models = await fetchModelsForOnboarding(state.captureProvider, apiKey, baseUrl);
      setCaptureModelItems(models);
      setState(s => ({ ...s, step: 'capture-model', captureBaseUrl: baseUrl }));
    },
  }),
) : null,
```

- [ ] **Step 4: Add capture-model step**

```typescript
state.step === 'capture-model' ? React.createElement(Box, { flexDirection: 'column' },
  React.createElement(Text, { bold: true }, 'Select model'),
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
```

- [ ] **Step 5: Wire project-dir → capture-provider**

In the `project-dir` step's `onSubmit`, change the next step from `'platforms'` to `'capture-provider'`:

```typescript
setState(s => ({ ...s, step: 'capture-provider', projectDir: dir }));
```

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

---

### Task 10: Add embedding-key and reranker-key steps

**Files:**
- Modify: `src/commands/onboarding.tsx`

- [ ] **Step 1: Add embedding-key step**

Currently `openai-key` and `jina-key` are separate steps. Replace them with a single `embedding-key` step that checks `collectedKeys` for deduplication.

> **Invariant:** `embedding-key` is only reachable when `searchEngine === 'lancedb'` AND `embeddingProvider !== 'ollama'`. This is enforced structurally by the existing routing (search-engine step only routes to `embedding-provider` for lancedb). No explicit guard needed inside the step render itself.

Remove the `openai-key` and `jina-key` step renders entirely. Add:

```typescript
state.step === 'embedding-key' ? React.createElement(Box, { flexDirection: 'column' },
  React.createElement(Text, { bold: true },
    `${state.embeddingProvider === 'openai' ? 'OpenAI' : 'Jina AI'} API key (for embeddings)`
  ),
  React.createElement(Text, { dimColor: true }, '  Will be merged into .memobank/.env — press Enter to skip'),
  React.createElement(TextInput, {
    value: embeddingKeyInput,
    onChange: setEmbeddingKeyInput,
    onSubmit: (value: string) => {
      const envKey = state.embeddingProvider === 'openai' ? 'OPENAI_API_KEY' : 'JINA_API_KEY';
      const updatedKeys = value.trim()
        ? { ...state.collectedKeys, [envKey]: value.trim() }
        : state.collectedKeys;
      setState(s => ({ ...s, step: 'reranker', collectedKeys: updatedKeys }));
    },
  }),
) : null,
```

- [ ] **Step 2: Update embedding-provider step to route to embedding-key or reranker**

In the `embedding-provider` step's `onSelect`, replace the routing:

```typescript
// Before (routes to openai-key / jina-key):
if (provider === 'ollama') {
  setState(s => ({ ...s, step: 'ollama-url', embeddingProvider: provider }));
} else if (provider === 'openai') {
  setState(s => ({ ...s, step: 'openai-key', embeddingProvider: provider }));
} else {
  setState(s => ({ ...s, step: 'jina-key', embeddingProvider: provider }));
}

// After (routes to embedding-key, skip if key already collected):
const needsKey = provider !== 'ollama';
const envKey = provider === 'openai' ? 'OPENAI_API_KEY' : 'JINA_API_KEY';
const alreadyHaveKey = needsKey && Boolean(state.collectedKeys[envKey]);
setState(s => ({
  ...s,
  embeddingProvider: provider,
  step: provider === 'ollama' ? 'ollama-url' :
        alreadyHaveKey ? 'reranker' :
        'embedding-key',
}));
```

- [ ] **Step 3: Add reranker-key step**

After the `reranker-provider` step, add:

```typescript
state.step === 'reranker-key' ? React.createElement(Box, { flexDirection: 'column' },
  React.createElement(Text, { bold: true },
    `${state.rerankerProvider === 'jina' ? 'Jina AI' : 'Cohere'} API key (for reranking)`
  ),
  React.createElement(Text, { dimColor: true }, '  Will be merged into .memobank/.env — press Enter to skip'),
  React.createElement(TextInput, {
    value: rerankerKeyInput,
    onChange: setRerankerKeyInput,
    onSubmit: (value: string) => {
      const envKey = state.rerankerProvider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY';
      const updatedKeys = value.trim()
        ? { ...state.collectedKeys, [envKey]: value.trim() }
        : state.collectedKeys;
      const finalState = { ...state, step: 'done' as Step, enableReranker: true, collectedKeys: updatedKeys };
      if (setupRunning.current) return;
      setupRunning.current = true;
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
```

- [ ] **Step 4: Update `reranker-provider` step to route to `reranker-key`**

In `reranker-provider`'s `onSelect`, instead of immediately calling `runSetup`, route to `reranker-key` after checking deduplication:

```typescript
onSelect: (item: { label: string; value: unknown }) => {
  const provider = String(item.value);
  const envKey = provider === 'jina' ? 'JINA_API_KEY' : 'COHERE_API_KEY';
  const alreadyHaveKey = Boolean(state.collectedKeys[envKey]);

  if (alreadyHaveKey) {
    // Key already collected — go straight to done
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
    setState(s => ({ ...s, step: 'reranker-key', rerankerProvider: provider }));
  }
},
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

---

### Task 11: Consolidate .env writes into runSetup + update config for capture

**Files:**
- Modify: `src/commands/onboarding.tsx`

- [ ] **Step 1: Remove inline .env writes from `runSetup`**

In `runSetup`, find the OpenAI and Jina inline `.env` write blocks (currently lines 197–219) and delete them. The API keys are now in `state.collectedKeys` and will be written at the end.

- [ ] **Step 2: Add capture config write to `runSetup`**

At the start of `runSetup` (after `initConfig`), add capture config write:

```typescript
// Write capture config if provider selected
if (state.captureProvider) {
  const config = loadConfig(repoRoot);
  config.capture = {
    provider: state.captureProvider as import('../types').CaptureProvider,
    model: state.captureModel || undefined,
    ...(state.captureBaseUrl ? { base_url: state.captureBaseUrl } : {}),
  };
  writeConfig(repoRoot, config);
  summaryLines.push(`Capture: ${state.captureProvider} / ${state.captureModel}`);
}
```

- [ ] **Step 3: Write all collected keys to `.memobank/.env` at the end of `runSetup`**

Add at the end of `runSetup` (before the `return` statement):

```typescript
// Write all collected API keys to .memobank/.env
// NOTE: `repoRoot` here is the .memobank/ directory itself (e.g. /repo/.memobank/),
// so path.join(repoRoot, '.env') → /repo/.memobank/.env — which is correct.
const allKeys = state.collectedKeys;
if (Object.keys(allKeys).length > 0) {
  const today = new Date().toISOString().split('T')[0];
  const envPath = path.join(repoRoot, '.env');
  const header = `# memobank API keys — do not commit\n# Generated by memo onboarding on ${today}\n\n`;
  const lines = Object.entries(allKeys)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(envPath, header + lines + '\n', 'utf-8');
  summaryLines.push(`API keys: ${Object.keys(allKeys).join(', ')} → ${envPath}`);
}

// Create/append .memobank/.gitignore with .env entry
const gitignorePath = path.join(repoRoot, '.gitignore');
const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
if (!existing.includes('.env')) {
  fs.writeFileSync(gitignorePath, existing + (existing.endsWith('\n') ? '' : '\n') + '.env\n', 'utf-8');
}
```

- [ ] **Step 4: Update reranker config write to NOT tell user to set env manually**

In `runSetup`, find the line:
```typescript
summaryLines.push(`Reranker: ${state.rerankerProvider} (set ${keyVar} env var)`);
```
Replace with:
```typescript
summaryLines.push(`Reranker: ${state.rerankerProvider}`);
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 7: Run all tests**

```bash
NODE_OPTIONS=--experimental-vm-modules npx jest -v
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/commands/onboarding.tsx
git commit -m "feat: add capture provider + API key collection steps to onboarding"
```

---

### Task 12: Manual smoke test

- [ ] **Step 1: Run onboarding in a temp project**

```bash
mkdir -p /tmp/test-memo-project && cd /tmp/test-memo-project && git init
node /home/ubuntu/.openclaw/workspace-code/memobank-cli/dist/cli.js onboarding
```

Walk through:
- Enter project name
- Enter project dir (accept default `.memobank`)
- Select capture provider: `anthropic`
- Enter a test key (any non-empty string for smoke test)
- Select a model
- Complete remaining steps (skip workspace, use text engine, skip reranker)

Expected: `.memobank/` created, `.memobank/.env` contains the API key, `.memobank/.gitignore` contains `.env`, `meta/config.yaml` contains `capture.provider: anthropic`.

- [ ] **Step 2: Verify files**

```bash
cat /tmp/test-memo-project/.memobank/.env
cat /tmp/test-memo-project/.memobank/.gitignore
cat /tmp/test-memo-project/.memobank/meta/config.yaml
```

Expected outputs:
- `.env`: `ANTHROPIC_API_KEY=<value>`
- `.gitignore`: contains `.env`
- `config.yaml`: contains `capture: { provider: anthropic, model: ... }`

- [ ] **Step 3: Verify dotenv load works**

```bash
cd /tmp/test-memo-project
node /home/ubuntu/.openclaw/workspace-code/memobank-cli/dist/cli.js capture --auto 2>&1 | tee /tmp/capture-out.txt
# Assert "No capture provider configured" is NOT in the output
grep -c "No capture provider configured" /tmp/capture-out.txt | grep -q "^0$" && echo "PASS: dotenv loaded" || echo "FAIL: capture provider not found"
```

Expected: "PASS: dotenv loaded" printed. The command output should say "No recent Claude Code auto-memory files found" (no session files to process yet) — NOT "No capture provider configured".

- [ ] **Step 4: Final commit**

```bash
cd /home/ubuntu/.openclaw/workspace-code/memobank-cli
git add -p  # review any remaining changes
git commit -m "feat: complete capture provider multi-LLM support and API key collection"
```

---

## Appendix: Key env var mapping

| Provider | Env Var |
|---|---|
| anthropic | `ANTHROPIC_API_KEY` |
| openai | `OPENAI_API_KEY` |
| gemini | `GEMINI_API_KEY` |
| openrouter | `OPENROUTER_API_KEY` |
| ollama | _(none)_ |
| Jina (embed/rerank) | `JINA_API_KEY` |
| Cohere (rerank) | `COHERE_API_KEY` |
| Azure (embed) | `AZURE_API_KEY` |
