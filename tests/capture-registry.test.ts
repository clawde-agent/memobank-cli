import { CAPTURE_REGISTRY } from '../src/core/providers/capture-registry';
import {
  captureConfigFromMemoConfig,
  createCaptureProvider,
  fetchAvailableModels,
} from '../src/core/capture-provider';
import type { MemoConfig } from '../src/types';

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

  it('fetchAvailableModels falls back to descriptor.fallbackModels on unreachable URL', async () => {
    const models = await fetchAvailableModels('openai', undefined, 'http://localhost:1/v1');
    expect(models).toEqual(['gpt-4o-mini', 'gpt-4o', 'o3-mini']);
  });
});
