import type { EmbeddingProvider } from '../../types';

export interface EmbeddingProviderDescriptor {
  readonly name: EmbeddingProvider;
  readonly label: string;
  readonly requiresApiKey: boolean;
  readonly apiKeyEnv?: string;
  /** Whether to display this provider in the onboarding wizard */
  readonly showInWizard: boolean;
  readonly defaultModel: string;
  readonly defaultBaseUrl: string;
  /** Default dimensions for the defaultModel */
  readonly defaultDimensions: number;
  /** Return null on success or an error message string on failure */
  testConnection?(baseUrl: string, model: string): Promise<string | null>;
  /** Return list of available model names from the running local service */
  fetchModels?(baseUrl: string): Promise<string[]>;
}

export const EMBEDDING_REGISTRY = new Map<EmbeddingProvider, EmbeddingProviderDescriptor>();

// ---------------------------------------------------------------------------
// Dimension lookup — shared across descriptors
// ---------------------------------------------------------------------------
const KNOWN_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'mxbai-embed-large': 1024,
  'nomic-embed-text': 768,
  'all-minilm': 384,
  'all-mpnet-base-v2': 768,
  'jina-embeddings-v3': 1024,
  'jina-embeddings-v2-base-en': 768,
  'jina-embeddings-v2-small-en': 512,
};

export function lookupDimensions(model: string): number {
  if (KNOWN_DIMENSIONS[model]) return KNOWN_DIMENSIONS[model];
  for (const [key, dim] of Object.entries(KNOWN_DIMENSIONS)) {
    if (model.includes(key)) return dim;
  }
  return 1536;
}

// ---------------------------------------------------------------------------
// openai
// ---------------------------------------------------------------------------
EMBEDDING_REGISTRY.set('openai', {
  name: 'openai',
  label: 'OpenAI',
  requiresApiKey: true,
  apiKeyEnv: 'OPENAI_API_KEY',
  showInWizard: true,
  defaultModel: 'text-embedding-3-small',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultDimensions: 1536,
});

// ---------------------------------------------------------------------------
// azure
// ---------------------------------------------------------------------------
EMBEDDING_REGISTRY.set('azure', {
  name: 'azure',
  label: 'Azure OpenAI',
  requiresApiKey: true,
  apiKeyEnv: 'AZURE_API_KEY',
  showInWizard: false,
  defaultModel: 'text-embedding-ada-002',
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultDimensions: 1536,
});

// ---------------------------------------------------------------------------
// ollama
// ---------------------------------------------------------------------------
EMBEDDING_REGISTRY.set('ollama', {
  name: 'ollama',
  label: 'Ollama (local)',
  requiresApiKey: false,
  showInWizard: true,
  defaultModel: 'mxbai-embed-large',
  defaultBaseUrl: 'http://localhost:11434/v1',
  defaultDimensions: 1024,
  async testConnection(baseUrl, model) {
    try {
      const base = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) return `Ollama returned HTTP ${res.status}`;
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name);
      const found = names.some((n) => n === model || n.startsWith(`${model}:`));
      if (!found) return `Model "${model}" not found — run: ollama pull ${model}`;
      return null;
    } catch {
      return `Cannot reach Ollama at ${baseUrl} — run: ollama serve`;
    }
  },
  async fetchModels(baseUrl) {
    try {
      const base = baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) return [];
      const data = (await res.json()) as { models?: { name: string }[] };
      return (data.models ?? []).map((m) => m.name);
    } catch {
      return [];
    }
  },
});

// ---------------------------------------------------------------------------
// llamacpp
// ---------------------------------------------------------------------------
EMBEDDING_REGISTRY.set('llamacpp', {
  name: 'llamacpp',
  label: 'llama.cpp (local)',
  requiresApiKey: false,
  showInWizard: true,
  defaultModel: 'local-model',
  defaultBaseUrl: 'http://localhost:8080/v1',
  defaultDimensions: 1536,
});

// ---------------------------------------------------------------------------
// jina
// ---------------------------------------------------------------------------
EMBEDDING_REGISTRY.set('jina', {
  name: 'jina',
  label: 'Jina AI',
  requiresApiKey: true,
  apiKeyEnv: 'JINA_API_KEY',
  showInWizard: true,
  defaultModel: 'jina-embeddings-v3',
  defaultBaseUrl: 'https://api.jina.ai/v1',
  defaultDimensions: 1024,
});

// ---------------------------------------------------------------------------
// custom
// ---------------------------------------------------------------------------
EMBEDDING_REGISTRY.set('custom', {
  name: 'custom',
  label: 'Custom (OpenAI-compatible)',
  requiresApiKey: false,
  showInWizard: false,
  defaultModel: 'local-model',
  defaultBaseUrl: 'http://localhost:8080/v1',
  defaultDimensions: 1536,
});

// ---------------------------------------------------------------------------
// omlx
// ---------------------------------------------------------------------------
EMBEDDING_REGISTRY.set('omlx', {
  name: 'omlx',
  label: 'oMLX (local, Apple Silicon)',
  requiresApiKey: false,
  showInWizard: true,
  defaultModel: 'local-model',
  defaultBaseUrl: 'http://localhost:8000/v1',
  defaultDimensions: 1536,
  async testConnection(baseUrl) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`);
      if (!res.ok) return `oMLX not reachable at ${baseUrl}`;
      return null;
    } catch {
      return `Cannot connect to oMLX at ${baseUrl}`;
    }
  },
  async fetchModels(baseUrl) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`);
      if (!res.ok) return [];
      const data = (await res.json()) as { data?: { id: string }[] };
      return (data.data ?? []).map((m) => m.id);
    } catch {
      return [];
    }
  },
});
