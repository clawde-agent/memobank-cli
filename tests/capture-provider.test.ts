import type { CaptureProviderName, CaptureConfig } from '../src/core/capture-provider';

describe('CaptureProviderName', () => {
  it('accepts all expected provider values', () => {
    const providers: CaptureProviderName[] = [
      'anthropic',
      'openai',
      'gemini',
      'openrouter',
      'ollama',
    ];
    expect(providers).toHaveLength(5);
  });
});

describe('CaptureConfig', () => {
  it('accepts minimal config (ollama — no key needed)', () => {
    const cfg: CaptureConfig = { provider: 'ollama', model: 'llama3.2' };
    expect(cfg.provider).toBe('ollama');
    expect(cfg.apiKey).toBeUndefined();
  });

  it('accepts full config with optional fields', () => {
    const cfg: CaptureConfig = {
      provider: 'openrouter',
      model: 'openai/gpt-4o-mini',
      apiKey: 'sk-or-test',
      baseUrl: 'https://openrouter.ai/api/v1',
    };
    expect(cfg.baseUrl).toBeDefined();
  });
});
