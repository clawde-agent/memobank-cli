# Provider Registry Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 25+ provider-name if-else/switch branches across 5 files with three self-contained Provider Descriptor Registries (Capture, Reranker, Embedding) so adding a new provider requires exactly two edits: widen the union in `types.ts`, add one descriptor to the relevant registry. See ADR-0001 and ADR-0002.

**Architecture:** Each registry exports a `ReadonlyMap<ProviderName, ProviderDescriptor>`. Each descriptor carries all provider-specific metadata (`requiresApiKey`, `requiresBaseUrlStep`, `apiKeyEnv`, `defaultBaseUrl`, `defaultModel`, `showInWizard`) and factory methods (`fetchModels`, `create`/`rerank`, optional `testConnection`). All three Provider Name Union types (`CaptureProviderName`, `EmbeddingProvider`, `RerankerProvider`) live in `types.ts` — the single authoritative extension point. Callers become thin registry lookups. The three concrete provider implementations (`providers/anthropic.ts`, `providers/openai-compat.ts`, `providers/gemini.ts`) are **unchanged**.

**Tech Stack:** TypeScript strict, Jest + `--experimental-vm-modules`, existing `CaptureProvider` interface, OpenAI SDK.

**Design decisions locked in (do not re-open without updating ADRs):**

- `requiresApiKey: boolean` is the field name on all descriptors — not `isLocal` (which was deployment-topology, not functional)
- `requiresBaseUrlStep: boolean` on `CaptureProviderDescriptor` drives wizard routing after the key step
- `showInWizard: boolean` on `EmbeddingProviderDescriptor` — `azure` and `custom` are `false`
- `testConnection?(baseUrl, model): Promise<string | null>` optional on `EmbeddingProviderDescriptor`
- `EmbeddingProvider` moves from `embedding.ts` to `types.ts` (breaks circular import)
- `RerankerProvider` moves from `reranker.ts` to `types.ts` (consistency)

---

## Chunk 1: Capture Registry

### Task 1: Move EmbeddingProvider + RerankerProvider to types.ts

**Files:**

- Modify: `src/types.ts`
- Modify: `src/core/embedding.ts`
- Modify: `src/core/reranker.ts`

This must happen before the registry files are created to avoid circular imports.

- [ ] **Step 1: Add both types to types.ts**

In `src/types.ts`, add after `CaptureProviderName`:

```typescript
export type EmbeddingProvider =
  | 'openai'
  | 'azure'
  | 'ollama'
  | 'llamacpp'
  | 'jina'
  | 'custom'
  | 'omlx';
export type RerankerProvider = 'jina' | 'cohere' | 'omlx';
```

And update `MemoConfig.reranker.provider` from the inline literal to the named type:

```typescript
reranker?: {
  enabled: boolean;
  provider: RerankerProvider;   // was: 'jina' | 'cohere' | 'omlx'
  model?: string;
  top_n?: number;
  base_url?: string;
};
```

- [ ] **Step 2: Re-export from embedding.ts and reranker.ts**

In `src/core/embedding.ts`, replace the type definition with a re-export:

```typescript
// Before: export type EmbeddingProvider = 'openai' | 'azure' | ...
// After:
export type { EmbeddingProvider } from '../types';
```

In `src/core/reranker.ts`, replace the type definition with a re-export:

```typescript
// Before: export type RerankerProvider = 'jina' | 'cohere' | 'omlx';
// After:
export type { RerankerProvider } from '../types';
```

- [ ] **Step 3: Typecheck — zero errors**

```
npm run typecheck
```

- [ ] **Step 4: Commit**

```
git add src/types.ts src/core/embedding.ts src/core/reranker.ts
git commit -m "refactor(types): consolidate EmbeddingProvider + RerankerProvider into types.ts"
```

---

### Task 2: CaptureProviderDescriptor interface + failing tests

**Files:**

- Create: `src/core/providers/capture-registry.ts`
- Create: `tests/capture-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/capture-registry.test.ts
import {
  CAPTURE_REGISTRY,
  type CaptureProviderDescriptor,
} from '../src/core/providers/capture-registry';

describe('CAPTURE_REGISTRY — structure', () => {
  const ALL_PROVIDERS = [
    'anthropic',
    'openai',
    'openrouter',
    'ollama',
    'llamacpp',
    'gemini',
    'omlx',
  ];

  it('has an entry for every CaptureProviderName', () => {
    for (const name of ALL_PROVIDERS) {
      expect(CAPTURE_REGISTRY.has(name as never)).toBe(true);
    }
  });

  it('every descriptor has required fields', () => {
    for (const [, d] of CAPTURE_REGISTRY) {
      expect(typeof d.name).toBe('string');
      expect(typeof d.label).toBe('string');
      expect(typeof d.requiresApiKey).toBe('boolean');
      expect(typeof d.requiresBaseUrlStep).toBe('boolean');
      expect(typeof d.defaultModel).toBe('string');
      expect(Array.isArray(d.fallbackModels)).toBe(true);
      expect(typeof d.fetchModels).toBe('function');
      expect(typeof d.create).toBe('function');
    }
  });

  it('local providers have requiresApiKey=false and no apiKeyEnv', () => {
    for (const name of ['ollama', 'llamacpp', 'omlx']) {
      const d = CAPTURE_REGISTRY.get(name as never)!;
      expect(d.requiresApiKey).toBe(false);
      expect(d.apiKeyEnv).toBeUndefined();
    }
  });

  it('cloud providers have requiresApiKey=true and apiKeyEnv set', () => {
    const cases: Array<[string, string]> = [
      ['anthropic', 'ANTHROPIC_API_KEY'],
      ['openai', 'OPENAI_API_KEY'],
      ['openrouter', 'OPENROUTER_API_KEY'],
      ['gemini', 'GEMINI_API_KEY'],
    ];
    for (const [name, envVar] of cases) {
      const d = CAPTURE_REGISTRY.get(name as never)!;
      expect(d.requiresApiKey).toBe(true);
      expect(d.apiKeyEnv).toBe(envVar);
    }
  });

  it('only openrouter requires the base-url wizard step after the key step', () => {
    expect(CAPTURE_REGISTRY.get('openrouter')!.requiresBaseUrlStep).toBe(true);
    for (const name of ['anthropic', 'openai', 'gemini']) {
      expect(CAPTURE_REGISTRY.get(name as never)!.requiresBaseUrlStep).toBe(false);
    }
  });

  it('local providers all require the base-url wizard step', () => {
    for (const name of ['ollama', 'llamacpp', 'omlx']) {
      expect(CAPTURE_REGISTRY.get(name as never)!.requiresBaseUrlStep).toBe(true);
    }
  });
});

describe('CAPTURE_REGISTRY — behaviour', () => {
  it('create() returns a CaptureProvider for an openai-compat local provider (no network)', () => {
    const d = CAPTURE_REGISTRY.get('ollama')!;
    const p = d.create({
      provider: 'ollama',
      model: 'llama3.2',
      baseUrl: 'http://localhost:11434/v1',
    });
    expect(p).not.toBeNull();
    expect(typeof (p as { extract?: unknown }).extract).toBe('function');
  });

  it('create() returns a CaptureProvider for an openai-compat cloud provider (no network)', () => {
    const d = CAPTURE_REGISTRY.get('openai')!;
    const p = d.create({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'sk-test' });
    expect(p).not.toBeNull();
    expect(typeof (p as { extract?: unknown }).extract).toBe('function');
  });

  it('create() returns a CaptureProvider for anthropic (no network)', () => {
    const d = CAPTURE_REGISTRY.get('anthropic')!;
    const p = d.create({ provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'sk-test' });
    expect(p).not.toBeNull();
    expect(typeof (p as { extract?: unknown }).extract).toBe('function');
  });

  it('create() returns a CaptureProvider for gemini (no network)', () => {
    const d = CAPTURE_REGISTRY.get('gemini')!;
    const p = d.create({ provider: 'gemini', model: 'gemini-2.0-flash', apiKey: 'key-test' });
    expect(p).not.toBeNull();
    expect(typeof (p as { extract?: unknown }).extract).toBe('function');
  });

  it('fetchModels returns anthropic curated list without a network call', async () => {
    const models = await CAPTURE_REGISTRY.get('anthropic')!.fetchModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toMatch(/claude/);
  });

  it('fetchModels returns empty array for llamacpp (no listing endpoint)', async () => {
    const models = await CAPTURE_REGISTRY.get('llamacpp')!.fetchModels();
    expect(models).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — fails (module not found)**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/capture-registry.test.ts -v
```

- [ ] **Step 3: Create interface + empty registry**

```typescript
// src/core/providers/capture-registry.ts
import type { CaptureProviderName, CaptureConfig } from '../../types';
import type { CaptureProvider } from '../capture-provider';

export interface CaptureProviderDescriptor {
  readonly name: CaptureProviderName;
  readonly label: string;
  readonly requiresApiKey: boolean;
  readonly requiresBaseUrlStep: boolean;
  readonly apiKeyEnv?: string;
  readonly defaultBaseUrl?: string;
  readonly defaultModel: string;
  readonly fallbackModels: string[];
  fetchModels(apiKey?: string, baseUrl?: string): Promise<string[]>;
  create(config: CaptureConfig): CaptureProvider;
}

export const CAPTURE_REGISTRY = new Map<CaptureProviderName, CaptureProviderDescriptor>();
```

- [ ] **Step 4: Run — structural FAIL (empty map), interface tests PASS**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/capture-registry.test.ts -v
```

- [ ] **Step 5: Commit stub**

```
git add src/core/providers/capture-registry.ts tests/capture-registry.test.ts
git commit -m "feat(registry): CaptureProviderDescriptor interface + test suite"
```

---

### Task 3: Implement all 7 capture descriptors

**Files:**

- Modify: `src/core/providers/capture-registry.ts` (add descriptors)

- [ ] **Step 1: Add descriptors**

Append to `src/core/providers/capture-registry.ts`:

```typescript
// --- shared helpers ---

async function fetchOpenAIModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id: string; context_length?: number }[] };
    return (data.data ?? [])
      .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
      .slice(0, 20)
      .map((m) => m.id);
  } catch {
    return [];
  }
}

// Lazy require — keeps optional SDKs (e.g. @google/generative-ai) from being
// loaded unless the provider is actually used. ESLint suppression is intentional.
/* eslint-disable @typescript-eslint/no-require-imports */
const _compat = () =>
  (
    require('./openai-compat') as {
      createOpenAICompatProvider: (k: string, m: string, b?: string) => CaptureProvider;
    }
  ).createOpenAICompatProvider;
const _anthropic = () =>
  (require('./anthropic') as { createAnthropicProvider: (k: string, m: string) => CaptureProvider })
    .createAnthropicProvider;
const _gemini = () =>
  (require('./gemini') as { createGeminiProvider: (k: string, m: string) => CaptureProvider })
    .createGeminiProvider;
/* eslint-enable @typescript-eslint/no-require-imports */

const ANTHROPIC_CURATED = [
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-opus-4-5',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
];

const descriptors: CaptureProviderDescriptor[] = [
  {
    name: 'anthropic',
    label: 'Anthropic (Claude)',
    requiresApiKey: true,
    requiresBaseUrlStep: false,
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-haiku-4-5',
    fallbackModels: ANTHROPIC_CURATED,
    async fetchModels() {
      return ANTHROPIC_CURATED;
    },
    create: (cfg) => _anthropic()(cfg.apiKey!, cfg.model),
  },
  {
    name: 'openai',
    label: 'OpenAI',
    requiresApiKey: true,
    requiresBaseUrlStep: false,
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o-mini',
    fallbackModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    async fetchModels(apiKey, baseUrl) {
      const models = await fetchOpenAIModels(baseUrl ?? 'https://api.openai.com/v1', apiKey);
      return models.filter((id) => /^(gpt-|o\d)/.test(id)).sort();
    },
    create: (cfg) => _compat()(cfg.apiKey ?? '', cfg.model, cfg.baseUrl),
  },
  {
    name: 'openrouter',
    label: 'OpenRouter (access 200+ models)',
    requiresApiKey: true,
    requiresBaseUrlStep: true,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    fallbackModels: ['openai/gpt-4o-mini', 'anthropic/claude-3-5-haiku', 'google/gemini-2.0-flash'],
    async fetchModels(apiKey, baseUrl) {
      return fetchOpenAIModels(baseUrl ?? 'https://openrouter.ai/api/v1', apiKey);
    },
    create: (cfg) => _compat()(cfg.apiKey ?? '', cfg.model, cfg.baseUrl),
  },
  {
    name: 'ollama',
    label: 'Ollama (local, no API key)',
    requiresApiKey: false,
    requiresBaseUrlStep: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    fallbackModels: ['llama3.2', 'llama3.1', 'mistral', 'phi4'],
    async fetchModels(_key, baseUrl) {
      try {
        const base = (baseUrl ?? 'http://localhost:11434')
          .replace(/\/v1\/?$/, '')
          .replace(/\/$/, '');
        const res = await fetch(`${base}/api/tags`);
        if (!res.ok) return [];
        const data = (await res.json()) as { models?: { name: string }[] };
        return (data.models ?? []).map((m) => m.name);
      } catch {
        return [];
      }
    },
    create: (cfg) => _compat()(cfg.apiKey ?? '', cfg.model, cfg.baseUrl),
  },
  {
    name: 'llamacpp',
    label: 'llama.cpp (local, no API key)',
    requiresApiKey: false,
    requiresBaseUrlStep: true,
    defaultBaseUrl: 'http://localhost:8080/v1',
    defaultModel: 'local-model',
    fallbackModels: ['local-model'],
    async fetchModels() {
      return [];
    },
    create: (cfg) => _compat()(cfg.apiKey ?? '', cfg.model, cfg.baseUrl),
  },
  {
    name: 'gemini',
    label: 'Gemini (Google)',
    requiresApiKey: true,
    requiresBaseUrlStep: false,
    apiKeyEnv: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.0-flash',
    fallbackModels: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    async fetchModels(apiKey) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
          models?: { name: string; supportedGenerationMethods?: string[] }[];
        };
        return (data.models ?? [])
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => m.name.replace('models/', ''));
      } catch {
        return [];
      }
    },
    create: (cfg) => _gemini()(cfg.apiKey!, cfg.model),
  },
  {
    name: 'omlx',
    label: 'oMLX (local Apple Silicon, no API key)',
    requiresApiKey: false,
    requiresBaseUrlStep: true,
    defaultBaseUrl: 'http://localhost:8000/v1',
    defaultModel: 'local-model',
    fallbackModels: [],
    async fetchModels(_key, baseUrl) {
      try {
        const base = (baseUrl ?? 'http://localhost:8000/v1').replace(/\/$/, '');
        const res = await fetch(`${base}/models`);
        if (!res.ok) return [];
        const data = (await res.json()) as { data?: { id: string }[] };
        return (data.data ?? []).map((m) => m.id);
      } catch {
        return [];
      }
    },
    create: (cfg) => _compat()(cfg.apiKey ?? '', cfg.model, cfg.baseUrl),
  },
];

for (const d of descriptors) {
  CAPTURE_REGISTRY.set(d.name, d);
}
```

- [ ] **Step 2: Run — all 12 tests PASS**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/capture-registry.test.ts -v
```

- [ ] **Step 3: Commit**

```
git add src/core/providers/capture-registry.ts
git commit -m "feat(registry): implement all 7 capture provider descriptors"
```

---

### Task 4: Refactor capture-provider.ts to use the registry

**Files:**

- Modify: `src/core/capture-provider.ts`

Public API (exported function signatures) is **unchanged**.

- [ ] **Step 1: Add regression tests to capture-registry.test.ts**

```typescript
import {
  captureConfigFromMemoConfig,
  createCaptureProvider,
  fetchAvailableModels,
} from '../src/core/capture-provider';
import type { MemoConfig } from '../src/types';

const BASE_CONFIG: MemoConfig = {
  project: { name: 'x' },
  memory: { token_budget: 0, top_k: 0 },
  embedding: { engine: 'text' },
  search: { use_tags: false, use_summary: false },
  review: { enabled: false },
};

describe('capture-provider — registry integration', () => {
  it('captureConfigFromMemoConfig returns null when provider absent', () => {
    expect(captureConfigFromMemoConfig(BASE_CONFIG)).toBeNull();
  });

  it('captureConfigFromMemoConfig returns null for unknown provider', () => {
    const cfg = { ...BASE_CONFIG, capture: { provider: 'unknown' as never, model: 'x' } };
    expect(captureConfigFromMemoConfig(cfg)).toBeNull();
  });

  it('createCaptureProvider returns null for unknown provider', () => {
    expect(createCaptureProvider({ provider: 'unknown' as never, model: 'x' })).toBeNull();
  });

  it('fetchAvailableModels returns curated list for anthropic', async () => {
    const models = await fetchAvailableModels('anthropic');
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toMatch(/claude/);
  });

  it('fetchAvailableModels falls back to descriptor.fallbackModels on empty live result', async () => {
    const models = await fetchAvailableModels('openai', undefined, 'http://localhost:1/v1');
    expect(models).toEqual(['gpt-4o-mini', 'gpt-4o', 'o3-mini']);
  });
});
```

- [ ] **Step 2: Run regression tests — all pass (baseline)**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/capture-registry.test.ts -v
```

- [ ] **Step 3: Replace KEY_ENV, DEFAULT_MODEL, fetchAvailableModels, createCaptureProvider**

Remove the `KEY_ENV` and `DEFAULT_MODEL` records. Replace with registry lookups:

```typescript
import { CAPTURE_REGISTRY } from './providers/capture-registry';

export function captureConfigFromMemoConfig(config: MemoConfig): CaptureConfig | null {
  const cap = config.capture;
  if (!cap?.provider) return null;
  const descriptor = CAPTURE_REGISTRY.get(cap.provider);
  if (!descriptor) return null;
  const apiKey = descriptor.apiKeyEnv ? process.env[descriptor.apiKeyEnv] : undefined;
  if (descriptor.requiresApiKey && !apiKey) return null;
  return {
    provider: cap.provider,
    model: cap.model || descriptor.defaultModel,
    apiKey,
    baseUrl: cap.base_url,
  };
}

export async function fetchAvailableModels(
  provider: CaptureProviderName,
  apiKey?: string,
  baseUrl?: string
): Promise<string[]> {
  const descriptor = CAPTURE_REGISTRY.get(provider);
  if (!descriptor) return [];
  const live = await descriptor.fetchModels(apiKey, baseUrl);
  return live.length > 0 ? live : descriptor.fallbackModels;
}

export function createCaptureProvider(config: CaptureConfig): CaptureProvider | null {
  try {
    return CAPTURE_REGISTRY.get(config.provider)?.create(config) ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run all tests**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/capture-registry.test.ts tests/capture-auto.test.ts -v
npm run typecheck
```

- [ ] **Step 5: Commit**

```
git add src/core/capture-provider.ts
git commit -m "refactor(registry): wire capture-provider.ts to CAPTURE_REGISTRY"
```

---

## Chunk 2: Reranker Registry

### Task 5: RerankerDescriptor + 3 descriptors + refactor reranker.ts

**Files:**

- Create: `src/core/providers/reranker-registry.ts`
- Create: `tests/reranker-registry.test.ts`
- Modify: `src/core/reranker.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/reranker-registry.test.ts
import { RERANKER_REGISTRY } from '../src/core/providers/reranker-registry';

describe('RERANKER_REGISTRY — structure', () => {
  it('has entries for all three providers', () => {
    for (const name of ['jina', 'cohere', 'omlx']) {
      expect(RERANKER_REGISTRY.has(name as never)).toBe(true);
    }
  });

  it('omlx does not require an API key', () => {
    const d = RERANKER_REGISTRY.get('omlx')!;
    expect(d.requiresApiKey).toBe(false);
    expect(d.apiKeyEnv).toBeUndefined();
  });

  it('jina and cohere require an API key', () => {
    expect(RERANKER_REGISTRY.get('jina')!.requiresApiKey).toBe(true);
    expect(RERANKER_REGISTRY.get('cohere')!.requiresApiKey).toBe(true);
    expect(RERANKER_REGISTRY.get('jina')!.apiKeyEnv).toBe('JINA_API_KEY');
    expect(RERANKER_REGISTRY.get('cohere')!.apiKeyEnv).toBe('COHERE_API_KEY');
  });

  it('every descriptor has a rerank function and defaultModel', () => {
    for (const [, d] of RERANKER_REGISTRY) {
      expect(typeof d.rerank).toBe('function');
      expect(typeof d.defaultModel).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run — fails (module not found)**

- [ ] **Step 3: Create reranker-registry.ts**

```typescript
// src/core/providers/reranker-registry.ts
import type { RerankerProvider, RecallResult } from '../../types';

export type { RerankerProvider };

export interface RerankerDescriptor {
  readonly name: RerankerProvider;
  readonly label: string;
  readonly requiresApiKey: boolean;
  readonly apiKeyEnv?: string;
  readonly defaultModel: string;
  rerank(
    query: string,
    results: RecallResult[],
    documents: string[],
    model: string,
    top_n: number,
    opts: { apiKey?: string; baseUrl?: string }
  ): Promise<RecallResult[]>;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, options);
    if (res.ok || res.status < 500) return res;
    if (i < maxRetries - 1) await sleep(Math.pow(2, i) * 1000);
  }
  return fetch(url, options);
}

type RerankResult = { results: Array<{ index: number; relevance_score: number }> };

const descriptors: RerankerDescriptor[] = [
  {
    name: 'jina',
    label: 'Jina AI',
    requiresApiKey: true,
    apiKeyEnv: 'JINA_API_KEY',
    defaultModel: 'jina-reranker-v2-base-multilingual',
    async rerank(query, results, documents, model, top_n, { apiKey }) {
      const res = await fetchWithRetry('https://api.jina.ai/v1/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, query, documents, top_n }),
      });
      if (!res.ok) throw new Error(`Jina rerank failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as RerankResult;
      return data.results.map((r) => ({ ...results[r.index], score: r.relevance_score }));
    },
  },
  {
    name: 'cohere',
    label: 'Cohere',
    requiresApiKey: true,
    apiKeyEnv: 'COHERE_API_KEY',
    defaultModel: 'rerank-v3.5',
    async rerank(query, results, documents, model, top_n, { apiKey }) {
      const res = await fetchWithRetry('https://api.cohere.com/v2/rerank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, query, documents, top_n, return_documents: false }),
      });
      if (!res.ok) throw new Error(`Cohere rerank failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as RerankResult;
      return data.results.map((r) => ({ ...results[r.index], score: r.relevance_score }));
    },
  },
  {
    name: 'omlx',
    label: 'oMLX (local, no API key)',
    requiresApiKey: false,
    defaultModel: 'ModernBERT',
    async rerank(query, results, documents, model, top_n, { baseUrl }) {
      const base = (baseUrl ?? 'http://localhost:8000/v1').replace(/\/$/, '');
      const res = await fetchWithRetry(`${base}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, query, documents, top_n }),
      });
      if (!res.ok) throw new Error(`oMLX rerank failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as RerankResult;
      return data.results.map((r) => ({ ...results[r.index], score: r.relevance_score }));
    },
  },
];

export const RERANKER_REGISTRY = new Map<RerankerProvider, RerankerDescriptor>(
  descriptors.map((d) => [d.name, d])
);
```

- [ ] **Step 4: Run — all tests PASS**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/reranker-registry.test.ts -v
```

- [ ] **Step 5: Replace reranker.ts body**

```typescript
// src/core/reranker.ts
import type { RecallResult } from '../types';
import { RERANKER_REGISTRY } from './providers/reranker-registry';

export type { RerankerProvider } from './providers/reranker-registry';

export interface RerankerConfig {
  provider: import('../types').RerankerProvider;
  model?: string;
  top_n?: number;
  apiKey?: string;
  baseUrl?: string;
}

export async function rerank(
  query: string,
  results: RecallResult[],
  config: RerankerConfig
): Promise<RecallResult[]> {
  const descriptor = RERANKER_REGISTRY.get(config.provider);
  if (!descriptor) throw new Error(`Unknown reranker provider: ${config.provider}`);

  const model = config.model ?? descriptor.defaultModel;
  const top_n = config.top_n ?? results.length;
  const documents = results.map(
    (r) => `${r.memory.name}: ${r.memory.description}\n${r.memory.content.slice(0, 300)}`
  );

  if (descriptor.requiresApiKey) {
    const apiKey =
      config.apiKey ?? (descriptor.apiKeyEnv ? process.env[descriptor.apiKeyEnv] : undefined);
    if (!apiKey) throw new Error(`No API key found for reranker provider: ${config.provider}`);
    if (apiKey.length < 10)
      throw new Error(`Invalid API key format for ${config.provider}. Key too short.`);
    return descriptor.rerank(query, results, documents, model, top_n, {
      apiKey,
      baseUrl: config.baseUrl,
    });
  }

  return descriptor.rerank(query, results, documents, model, top_n, { baseUrl: config.baseUrl });
}
```

- [ ] **Step 6: Run typecheck + lint**

```
npm run typecheck && npm run lint
```

- [ ] **Step 7: Commit**

```
git add src/core/providers/reranker-registry.ts tests/reranker-registry.test.ts src/core/reranker.ts
git commit -m "refactor(registry): replace reranker if-else with RERANKER_REGISTRY"
```

---

## Chunk 3: Embedding Registry + Onboarding

### Task 6: EmbeddingProviderDescriptor + 7 descriptors + refactor embedding.ts

**Files:**

- Create: `src/core/providers/embedding-registry.ts`
- Create: `tests/embedding-registry.test.ts`
- Modify: `src/core/embedding.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/embedding-registry.test.ts
import { EMBEDDING_REGISTRY } from '../src/core/providers/embedding-registry';

describe('EMBEDDING_REGISTRY — structure', () => {
  const ALL = ['openai', 'azure', 'ollama', 'llamacpp', 'jina', 'custom', 'omlx'];

  it('has an entry for every EmbeddingProvider', () => {
    for (const name of ALL) {
      expect(EMBEDDING_REGISTRY.has(name as never)).toBe(true);
    }
  });

  it('azure and custom have showInWizard=false', () => {
    expect(EMBEDDING_REGISTRY.get('azure')!.showInWizard).toBe(false);
    expect(EMBEDDING_REGISTRY.get('custom')!.showInWizard).toBe(false);
  });

  it('all other providers have showInWizard=true', () => {
    for (const name of ['openai', 'ollama', 'llamacpp', 'jina', 'omlx']) {
      expect(EMBEDDING_REGISTRY.get(name as never)!.showInWizard).toBe(true);
    }
  });

  it('omlx has correct defaults', () => {
    const d = EMBEDDING_REGISTRY.get('omlx')!;
    expect(d.defaultBaseUrl).toBe('http://localhost:8000/v1');
    expect(d.defaultModel).toBe('BGE-M3');
    expect(d.defaultDimensions).toBe(1024);
    expect(d.requiresApiKey).toBe(false);
    expect(d.testConnection).toBeDefined();
  });

  it('ollama has testConnection defined', () => {
    expect(EMBEDDING_REGISTRY.get('ollama')!.testConnection).toBeDefined();
  });

  it('cloud providers have testConnection undefined', () => {
    for (const name of ['openai', 'azure', 'jina', 'custom']) {
      expect(EMBEDDING_REGISTRY.get(name as never)!.testConnection).toBeUndefined();
    }
  });

  it('every descriptor has required fields', () => {
    for (const [, d] of EMBEDDING_REGISTRY) {
      expect(typeof d.requiresApiKey).toBe('boolean');
      expect(typeof d.showInWizard).toBe('boolean');
      expect(typeof d.defaultBaseUrl).toBe('string');
      expect(typeof d.defaultModel).toBe('string');
      expect(typeof d.defaultDimensions).toBe('number');
      expect(typeof d.resolveApiKey).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run — fails (module not found)**

- [ ] **Step 3: Create embedding-registry.ts**

```typescript
// src/core/providers/embedding-registry.ts
import type { EmbeddingProvider } from '../../types';

export interface EmbeddingProviderDescriptor {
  readonly name: EmbeddingProvider;
  readonly label: string;
  readonly requiresApiKey: boolean;
  readonly showInWizard: boolean;
  readonly apiKeyEnv?: string;
  readonly defaultBaseUrl: string;
  readonly defaultModel: string;
  readonly defaultDimensions: number;
  resolveApiKey(): string | undefined;
  testConnection?(baseUrl: string, model: string): Promise<string | null>;
}

const descriptors: EmbeddingProviderDescriptor[] = [
  {
    name: 'openai',
    label: 'OpenAI (cloud, requires API key)',
    requiresApiKey: true,
    showInWizard: true,
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'text-embedding-3-small',
    defaultDimensions: 1536,
    resolveApiKey: () => process.env.OPENAI_API_KEY,
  },
  {
    name: 'azure',
    label: 'Azure OpenAI',
    requiresApiKey: true,
    showInWizard: false,
    apiKeyEnv: 'AZURE_API_KEY',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'text-embedding-ada-002',
    defaultDimensions: 1536,
    resolveApiKey: () => process.env.OPENAI_API_KEY ?? process.env.AZURE_API_KEY,
  },
  {
    name: 'ollama',
    label: 'Ollama (local, no API key needed)',
    requiresApiKey: false,
    showInWizard: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'mxbai-embed-large',
    defaultDimensions: 1024,
    resolveApiKey: () => undefined,
    async testConnection(baseUrl, model) {
      try {
        const base = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
        const res = await fetch(`${base}/api/tags`);
        if (!res.ok) return `Ollama returned HTTP ${res.status}`;
        const data = (await res.json()) as { models?: { name: string }[] };
        const found = (data.models ?? []).some(
          (m) => m.name === model || m.name.startsWith(`${model}:`)
        );
        return found ? null : `Model "${model}" not found — run: ollama pull ${model}`;
      } catch {
        return `Cannot reach Ollama at ${baseUrl} — run: ollama serve`;
      }
    },
  },
  {
    name: 'llamacpp',
    label: 'llama.cpp (local, no API key needed)',
    requiresApiKey: false,
    showInWizard: true,
    defaultBaseUrl: 'http://localhost:8080/v1',
    defaultModel: 'local-model',
    defaultDimensions: 1024,
    resolveApiKey: () => undefined,
  },
  {
    name: 'jina',
    label: 'Jina AI (cloud, requires API key)',
    requiresApiKey: true,
    showInWizard: true,
    apiKeyEnv: 'JINA_API_KEY',
    defaultBaseUrl: 'https://api.jina.ai/v1',
    defaultModel: 'jina-embeddings-v3',
    defaultDimensions: 1024,
    resolveApiKey: () => process.env.JINA_API_KEY,
  },
  {
    name: 'custom',
    label: 'Custom OpenAI-compatible endpoint',
    requiresApiKey: false,
    showInWizard: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'text-embedding-3-small',
    defaultDimensions: 1536,
    resolveApiKey: () => process.env.OPENAI_API_KEY,
  },
  {
    name: 'omlx',
    label: 'oMLX (local Apple Silicon, no API key needed)',
    requiresApiKey: false,
    showInWizard: true,
    defaultBaseUrl: 'http://localhost:8000/v1',
    defaultModel: 'BGE-M3',
    defaultDimensions: 1024,
    resolveApiKey: () => undefined,
    async testConnection(baseUrl, model) {
      try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`);
        if (!res.ok) return `oMLX returned HTTP ${res.status}`;
        const data = (await res.json()) as { data?: { id: string }[] };
        const ids = (data.data ?? []).map((m) => m.id);
        return ids.length > 0
          ? null
          : `oMLX running but no models loaded — check your model directory`;
      } catch {
        return `Cannot reach oMLX at ${baseUrl} — ensure oMLX is running`;
      }
    },
  },
];

export const EMBEDDING_REGISTRY = new Map<EmbeddingProvider, EmbeddingProviderDescriptor>(
  descriptors.map((d) => [d.name, d])
);
```

- [ ] **Step 4: Run — all tests PASS**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/embedding-registry.test.ts -v
```

- [ ] **Step 5: Refactor EmbeddingGenerator in embedding.ts to use registry**

Add import at top: `import { EMBEDDING_REGISTRY } from './providers/embedding-registry';`

Replace `constructor` apiKey logic:

```typescript
const descriptor = EMBEDDING_REGISTRY.get(config.provider);
const apiKey = config.apiKey ?? (descriptor?.requiresApiKey ? '' : 'local');
```

Replace `getDefaultBaseUrl()`:

```typescript
private getDefaultBaseUrl(provider: EmbeddingProvider): string {
  return EMBEDDING_REGISTRY.get(provider)?.defaultBaseUrl ?? 'https://api.openai.com/v1';
}
```

Replace `fromMemoConfig()` apiKey block:

```typescript
const descriptor = EMBEDDING_REGISTRY.get(provider);
if (!descriptor) return null;
const apiKey = descriptor.resolveApiKey();
if (descriptor.requiresApiKey && !apiKey && provider !== 'custom') return null;
```

Replace `getDefaultModel()`:

```typescript
private static getDefaultModel(provider: EmbeddingProvider): string {
  return EMBEDDING_REGISTRY.get(provider)?.defaultModel ?? 'text-embedding-3-small';
}
```

- [ ] **Step 6: Run tests + typecheck**

```
NODE_OPTIONS=--experimental-vm-modules npx jest tests/embedding-registry.test.ts tests/hybrid-engine.test.ts -v
npm run typecheck && npm run lint
```

- [ ] **Step 7: Commit**

```
git add src/core/providers/embedding-registry.ts tests/embedding-registry.test.ts src/core/embedding.ts
git commit -m "refactor(registry): embedding dispatch → EMBEDDING_REGISTRY, add omlx + testConnection"
```

---

### Task 7: Eliminate all provider-name branches from onboarding.tsx

**Files:**

- Modify: `src/commands/onboarding.tsx`

**Target: zero provider-name string literals in onboarding.tsx after this task.**

The following branches must all be eliminated. Work through them top-to-bottom in the file.

- [ ] **Step 1: Add registry imports**

```typescript
import { CAPTURE_REGISTRY } from '../core/providers/capture-registry';
import { RERANKER_REGISTRY } from '../core/providers/reranker-registry';
import { EMBEDDING_REGISTRY } from '../core/providers/embedding-registry';
import type { CaptureProviderName } from '../types';
import type { EmbeddingProvider } from '../types';
import type { RerankerProvider } from '../types';
```

Remove `FALLBACK_MODELS` and `DEFAULT_CAPTURE_MODEL` records — these are now in descriptors.

- [ ] **Step 2: runSetup — capture config (line ~122)**

Replace `DEFAULT_CAPTURE_MODEL[state.captureProvider]`:

```typescript
const captureDesc = CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName);
config.capture = {
  provider: state.captureProvider as CaptureProviderName,
  model: state.captureModel || captureDesc?.defaultModel || 'local-model',
  ...(state.captureBaseUrl ? { base_url: state.captureBaseUrl } : {}),
};
```

- [ ] **Step 3: runSetup — embedding config block (lines ~172–210)**

Replace the entire if-else chain:

```typescript
const embDesc = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider);
if (embDesc) {
  const rawUrl = (state.embeddingUrl || embDesc.defaultBaseUrl.replace('/v1', ''))
    .replace(/\/v1\/?$/, '')
    .replace(/\/$/, '');
  config.embedding.provider = embDesc.name;
  config.embedding.model = state.embeddingModel || embDesc.defaultModel;
  config.embedding.dimensions = embDesc.defaultDimensions;
  if (!embDesc.requiresApiKey) {
    config.embedding.base_url = rawUrl + '/v1';
    const connectError = await embDesc.testConnection?.(rawUrl, config.embedding.model);
    if (connectError != null) {
      summaryLines.push(`⚠  ${embDesc.label}: ${connectError}`);
    } else if (embDesc.testConnection) {
      summaryLines.push(`✓ ${embDesc.label} connected, model ready`);
    } else {
      summaryLines.push(`${embDesc.label} at ${rawUrl}`);
    }
  }
}
```

- [ ] **Step 4: capture-provider select + routing (lines ~455–477)**

```typescript
items: [...CAPTURE_REGISTRY.values()].map((d) => ({ label: d.label, value: d.name })),
onSelect: (item) => {
  const provider = String(item.value) as CaptureProviderName;
  const descriptor = CAPTURE_REGISTRY.get(provider)!;
  setState(s => ({ ...s, captureProvider: provider,
    step: descriptor.requiresBaseUrlStep ? 'capture-base-url' : 'capture-key' }));
},
```

- [ ] **Step 5: capture-key step — envKey + routing (lines ~489–501)**

```typescript
const descriptor = CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName)!;
const envKey = descriptor.apiKeyEnv ?? 'OPENAI_API_KEY';
// ... store key in collectedKeys[envKey] ...
if (descriptor.requiresBaseUrlStep) {
  setState((s) => ({
    ...s,
    step: 'capture-base-url',
    collectedKeys: { ...s.collectedKeys, [envKey]: key },
  }));
  return;
}
// ... else fetch models and go to capture-model ...
```

- [ ] **Step 6: capture-base-url step — default URL + help text (lines ~516–542)**

```typescript
const captureDesc = CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName);
const defaultCaptureUrl = captureDesc?.defaultBaseUrl ?? 'https://openrouter.ai/api/v1';
// Use captureDesc.label for help text; defaultCaptureUrl for placeholder and onSubmit default.
// For the apiKey lookup in onSubmit: state.collectedKeys[captureDesc?.apiKeyEnv ?? '']
```

- [ ] **Step 7: capture-model fallback (line ~564)**

```typescript
const model =
  value.trim() ||
  (CAPTURE_REGISTRY.get(state.captureProvider as CaptureProviderName)?.fallbackModels[0] ?? '');
```

- [ ] **Step 8: embedding-provider select + routing (lines ~651–669)**

```typescript
items: [...EMBEDDING_REGISTRY.values()]
  .filter((d) => d.showInWizard)
  .map((d) => ({ label: d.label, value: d.name })),
onSelect: (item) => {
  const provider = String(item.value) as EmbeddingProvider;
  const embDesc = EMBEDDING_REGISTRY.get(provider)!;
  const alreadyHaveKey = !embDesc.requiresApiKey || Boolean(state.collectedKeys[embDesc.apiKeyEnv ?? '']);
  setState(s => ({ ...s, embeddingProvider: provider,
    step: !embDesc.requiresApiKey ? 'ollama-url' : alreadyHaveKey ? 'reranker' : 'embedding-key' }));
},
```

- [ ] **Step 9: ollama-url step — labels and defaults (lines ~675–699)**

```typescript
const embDesc = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider);
const defaultEmbUrl = embDesc?.defaultBaseUrl.replace('/v1', '') ?? 'http://localhost:11434';
// Use embDesc.label for the step title; defaultEmbUrl for placeholder and onSubmit default.
```

- [ ] **Step 10: ollama-model step — labels and defaults (lines ~702–723)**

```typescript
const embDesc = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider);
// Use embDesc.label for title; embDesc.defaultModel for placeholder.
```

- [ ] **Step 11: embedding-key step — label and envKey (lines ~728–736)**

```typescript
const embDesc = EMBEDDING_REGISTRY.get(state.embeddingProvider as EmbeddingProvider)!;
const embEnvKey = embDesc.apiKeyEnv ?? 'OPENAI_API_KEY';
// Use embDesc.label for the key prompt title.
```

- [ ] **Step 12: reranker-provider select + routing (lines ~775–819)**

```typescript
items: [...RERANKER_REGISTRY.values()].map((d) => ({ label: d.label, value: d.name })),
onSelect: (item) => {
  const provider = String(item.value) as RerankerProvider;
  const rrDesc = RERANKER_REGISTRY.get(provider)!;
  if (!rrDesc.requiresApiKey) {
    // run setup immediately — omlx and any future no-key reranker
    if (setupRunning.current) return;
    setupRunning.current = true;
    const finalState = { ...state, step: 'done' as Step, enableReranker: true, rerankerProvider: provider };
    setState(finalState);
    runSetup(finalState, gitRoot).then(...).catch(...);
    return;
  }
  const alreadyHaveKey = Boolean(state.collectedKeys[rrDesc.apiKeyEnv!]);
  if (alreadyHaveKey) { /* run setup */ } else {
    setState(s => ({ ...s, step: 'reranker-key', enableReranker: true, rerankerProvider: provider }));
  }
},
```

- [ ] **Step 13: reranker-key step — label and envKey (lines ~823, ~832)**

```typescript
const rrDesc = RERANKER_REGISTRY.get(state.rerankerProvider as RerankerProvider)!;
const rrEnvKey = rrDesc.apiKeyEnv ?? '';
// Use rrEnvKey for the key prompt title and for storing in collectedKeys.
```

- [ ] **Step 14: runSetup — reranker provider cast (line ~218)**

```typescript
provider: state.rerankerProvider as RerankerProvider,
```

- [ ] **Step 15: Verify zero provider-name literals remain**

```
grep -n "=== 'ollama'\|=== 'llamacpp'\|=== 'openrouter'\|=== 'anthropic'\|=== 'gemini'\|=== 'jina'\|=== 'cohere'\|=== 'omlx'" src/commands/onboarding.tsx
```

Expected: no matches.

- [ ] **Step 16: Run typecheck + lint**

```
npm run typecheck && npm run lint
```

- [ ] **Step 17: Commit**

```
git add src/commands/onboarding.tsx
git commit -m "refactor(registry): onboarding.tsx fully data-driven — zero provider-name literals"
```

---

### Task 8: Final validation

- [ ] **Step 1: Full test suite**

```
npm test
```

Expected: all pass, coverage ≥ thresholds (branches 30%, functions/lines/statements 45%).

- [ ] **Step 2: Typecheck + lint**

```
npm run typecheck && npm run lint
```

Expected: zero errors.

- [ ] **Step 3: Smoke-test the onboarding wizard**

```
npm run dev -- onboarding
```

Verify:

- Capture provider list shows all 7 providers including oMLX
- Selecting a cloud provider (e.g. OpenAI) goes to API key step, then directly to model select
- Selecting openrouter goes to API key step, then to base-URL step
- Selecting ollama goes directly to base-URL step (no key step)
- Embedding list shows 5 providers (openai, ollama, llamacpp, jina, omlx) — NOT azure or custom
- Selecting oMLX embedding shows `http://localhost:8000` as the default URL
- Reranker list shows jina, cohere, omlx

- [ ] **Step 4: Final commit**

```
git add -p
git commit -m "chore(registry): provider descriptor registry refactor complete (ADR-0001, ADR-0002)"
```

---

## Adding a provider after this refactor

To add e.g. `mistral` as a capture provider:

1. Add `'mistral'` to `CaptureProviderName` in `src/types.ts`
2. Add one `CaptureProviderDescriptor` entry to `src/core/providers/capture-registry.ts`
3. Done — zero other files change
