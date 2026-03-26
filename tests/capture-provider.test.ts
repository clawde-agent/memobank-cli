import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CaptureProviderName, CaptureConfig } from '../src/core/capture-provider';
import { loadConfig, writeConfig } from '../src/config';

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

import { buildUserMessage, validateExtractionResult } from '../src/core/capture-provider';

describe('buildUserMessage', () => {
  it('wraps text in session tags', () => {
    expect(buildUserMessage('hello world')).toBe('<session>\nhello world\n</session>');
  });

  it('escapes < and > to prevent tag injection', () => {
    const msg = buildUserMessage('use <session> tags');
    expect(msg).toContain('&lt;session&gt;');
    expect(msg).not.toMatch(/<session>use/);
  });

  it('escapes closing tags', () => {
    expect(buildUserMessage('</session>')).toContain('&lt;/session&gt;');
  });
});

describe('validateExtractionResult', () => {
  const valid = {
    name: 'my-lesson',
    type: 'lesson',
    description: 'A thing',
    tags: ['api'],
    confidence: 'medium',
    content: 'Details',
  };

  it('returns the item when valid', () => {
    expect(validateExtractionResult(valid)).not.toBeNull();
  });

  it('returns null for non-object', () => {
    expect(validateExtractionResult('string')).toBeNull();
    expect(validateExtractionResult(null)).toBeNull();
  });

  it('returns null when required fields missing', () => {
    const { content: _c, ...noContent } = valid;
    expect(validateExtractionResult(noContent)).toBeNull();
  });

  it('returns null for invalid type enum', () => {
    expect(validateExtractionResult({ ...valid, type: 'hack' })).toBeNull();
  });

  it('returns null when name exceeds 100 chars', () => {
    expect(validateExtractionResult({ ...valid, name: 'a'.repeat(101) })).toBeNull();
  });

  it('returns null when content exceeds 10 000 chars', () => {
    expect(validateExtractionResult({ ...valid, content: 'x'.repeat(10_001) })).toBeNull();
  });
});

describe('config — capture field', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-cfg-'));
    fs.mkdirSync(path.join(tmpDir, 'meta'), { recursive: true });
  });
  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('round-trips capture config', () => {
    const cfg = loadConfig(tmpDir);
    cfg.capture = { provider: 'openai', model: 'gpt-4o-mini' };
    writeConfig(tmpDir, cfg);
    const reloaded = loadConfig(tmpDir);
    expect(reloaded.capture?.provider).toBe('openai');
    expect(reloaded.capture?.model).toBe('gpt-4o-mini');
  });

  it('returns undefined capture when field absent', () => {
    const cfg = loadConfig(tmpDir);
    expect(cfg.capture).toBeUndefined();
  });
});
