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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lazyAnthropicFactory(): (k: string, m: string) => CaptureProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./anthropic') as {
    createAnthropicProvider: (k: string, m: string) => CaptureProvider;
  };
  return mod.createAnthropicProvider;
}

function lazyOpenAICompatFactory(): (k: string, m: string, b?: string) => CaptureProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./openai-compat') as {
    createOpenAICompatProvider: (k: string, m: string, b?: string) => CaptureProvider;
  };
  return mod.createOpenAICompatProvider;
}

function lazyGeminiFactory(): (k: string, m: string) => CaptureProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./gemini') as {
    createGeminiProvider: (k: string, m: string) => CaptureProvider;
  };
  return mod.createGeminiProvider;
}

async function fetchOpenAICompatModels(
  apiKey: string | undefined,
  baseUrl: string,
  filter?: (id: string) => boolean,
  sort?: (
    a: { id: string; context_length?: number },
    b: { id: string; context_length?: number }
  ) => number,
  limit?: number
): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey ?? ''}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { id: string; context_length?: number }[] };
    let models = data.data ?? [];
    if (sort) models = models.sort(sort);
    if (limit) models = models.slice(0, limit);
    const ids = models.map((m) => m.id);
    return filter ? ids.filter(filter) : ids;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// anthropic
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('anthropic', {
  name: 'anthropic',
  label: 'Anthropic (Claude)',
  requiresApiKey: true,
  requiresBaseUrlStep: false,
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  defaultModel: 'claude-haiku-4-5',
  fallbackModels: [
    'claude-haiku-4-5',
    'claude-sonnet-4-5',
    'claude-opus-4-5',
    'claude-3-5-haiku-20241022',
    'claude-3-5-sonnet-20241022',
  ],
  async fetchModels(): Promise<string[]> {
    return this.fallbackModels;
  },
  create(config) {
    return lazyAnthropicFactory()(config.apiKey!, config.model);
  },
});

// ---------------------------------------------------------------------------
// openai
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('openai', {
  name: 'openai',
  label: 'OpenAI',
  requiresApiKey: true,
  requiresBaseUrlStep: false,
  apiKeyEnv: 'OPENAI_API_KEY',
  defaultModel: 'gpt-4o-mini',
  fallbackModels: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
  async fetchModels(apiKey, baseUrl) {
    const base = baseUrl ?? 'https://api.openai.com/v1';
    const models = await fetchOpenAICompatModels(apiKey, base, (id) => /^(gpt-|o\d)/.test(id));
    return models.length > 0 ? models.sort() : this.fallbackModels;
  },
  create(config) {
    return lazyOpenAICompatFactory()(config.apiKey ?? '', config.model, config.baseUrl);
  },
});

// ---------------------------------------------------------------------------
// openrouter
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('openrouter', {
  name: 'openrouter',
  label: 'OpenRouter',
  requiresApiKey: true,
  requiresBaseUrlStep: true,
  apiKeyEnv: 'OPENROUTER_API_KEY',
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openai/gpt-4o-mini',
  fallbackModels: [
    'openai/gpt-4o-mini',
    'anthropic/claude-haiku',
    'meta-llama/llama-3-8b-instruct',
  ],
  async fetchModels(apiKey, baseUrl) {
    const base = baseUrl ?? 'https://openrouter.ai/api/v1';
    return fetchOpenAICompatModels(
      apiKey,
      base,
      undefined,
      (a, b) => (b.context_length ?? 0) - (a.context_length ?? 0),
      20
    );
  },
  create(config) {
    return lazyOpenAICompatFactory()(config.apiKey ?? '', config.model, config.baseUrl);
  },
});

// ---------------------------------------------------------------------------
// ollama
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('ollama', {
  name: 'ollama',
  label: 'Ollama (local)',
  requiresApiKey: false,
  requiresBaseUrlStep: true,
  defaultBaseUrl: 'http://localhost:11434/v1',
  defaultModel: 'llama3.2',
  fallbackModels: ['llama3.2', 'llama3.1', 'mistral'],
  async fetchModels(_apiKey, baseUrl) {
    try {
      const base = (baseUrl ?? 'http://localhost:11434').replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: { name: string }[] };
      return (data.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  },
  create(config) {
    return lazyOpenAICompatFactory()(config.apiKey ?? '', config.model, config.baseUrl);
  },
});

// ---------------------------------------------------------------------------
// llamacpp
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('llamacpp', {
  name: 'llamacpp',
  label: 'llama.cpp (local)',
  requiresApiKey: false,
  requiresBaseUrlStep: true,
  defaultBaseUrl: 'http://localhost:8080/v1',
  defaultModel: 'local-model',
  fallbackModels: ['local-model'],
  async fetchModels(): Promise<string[]> {
    // llama-server loads a single model at startup; no listing API available.
    return [];
  },
  create(config) {
    return lazyOpenAICompatFactory()(config.apiKey ?? '', config.model, config.baseUrl);
  },
});

// ---------------------------------------------------------------------------
// gemini
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('gemini', {
  name: 'gemini',
  label: 'Google Gemini',
  requiresApiKey: true,
  requiresBaseUrlStep: false,
  apiKeyEnv: 'GEMINI_API_KEY',
  defaultModel: 'gemini-2.0-flash',
  fallbackModels: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
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
  create(config) {
    return lazyGeminiFactory()(config.apiKey!, config.model);
  },
});

// ---------------------------------------------------------------------------
// omlx
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('omlx', {
  name: 'omlx',
  label: 'oMLX (local)',
  requiresApiKey: false,
  requiresBaseUrlStep: true,
  defaultBaseUrl: 'http://localhost:8000/v1',
  defaultModel: 'local-model',
  fallbackModels: ['local-model'],
  async fetchModels(_apiKey, baseUrl) {
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
  create(config) {
    return lazyOpenAICompatFactory()(config.apiKey ?? '', config.model, config.baseUrl);
  },
});

// ---------------------------------------------------------------------------
// local  (generic OpenAI-compatible: LM Studio, vLLM, Jan, TabbyAPI, etc.)
// ---------------------------------------------------------------------------
CAPTURE_REGISTRY.set('local', {
  name: 'local',
  label: 'Local / OpenAI-compatible (LM Studio, vLLM, Jan…)',
  requiresApiKey: false,
  requiresBaseUrlStep: true,
  defaultBaseUrl: 'http://localhost:1234/v1',
  defaultModel: 'local-model',
  fallbackModels: ['local-model'],
  async fetchModels(_apiKey, baseUrl) {
    return fetchOpenAICompatModels(undefined, baseUrl ?? 'http://localhost:1234/v1');
  },
  create(config) {
    return lazyOpenAICompatFactory()(config.apiKey ?? '', config.model, config.baseUrl);
  },
});
