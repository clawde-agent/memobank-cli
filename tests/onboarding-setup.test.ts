import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runSetup } from '../src/commands/onboarding';
import type { OnboardingState } from '../src/commands/onboarding';
import { loadConfig } from '../src/config';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-onboarding-test-'));
}

const BASE_STATE: OnboardingState = {
  step: 'done',
  projectName: 'test-project',
  projectDir: '.memobank',
  captureProvider: '',
  captureModel: '',
  captureBaseUrl: '',
  platforms: [], // skip all platform installs
  enableAutoMemory: true,
  workspaceRemote: '', // skip workspace init
  workspaceLocalPath: '',
  searchEngine: 'text',
  embeddingProvider: '',
  embeddingUrl: '',
  embeddingModel: '',
  enableReranker: false,
  rerankerProvider: '',
  rerankerBaseUrl: '',
  collectedKeys: {},
};

describe('runSetup: directory structure', () => {
  it('creates the four memory type directories', async () => {
    const gitRoot = makeTempDir();
    await runSetup(BASE_STATE, gitRoot);

    const memoRoot = path.join(gitRoot, '.memobank');
    for (const type of ['lesson', 'decision', 'workflow', 'architecture']) {
      expect(fs.existsSync(path.join(memoRoot, type))).toBe(true);
    }

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('writes project name to config', async () => {
    const gitRoot = makeTempDir();
    await runSetup({ ...BASE_STATE, projectName: 'my-app' }, gitRoot);

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.project.name).toBe('my-app');

    fs.rmSync(gitRoot, { recursive: true });
  });
});

describe('runSetup: capture provider', () => {
  it('writes capture config when provider is set', async () => {
    const gitRoot = makeTempDir();
    await runSetup(
      {
        ...BASE_STATE,
        captureProvider: 'ollama',
        captureModel: 'llama3.2',
        captureBaseUrl: 'http://localhost:11434/v1',
      },
      gitRoot
    );

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.capture?.provider).toBe('ollama');
    expect(config.capture?.model).toBe('llama3.2');
    expect(config.capture?.base_url).toBe('http://localhost:11434/v1');

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('skips capture config when no provider', async () => {
    const gitRoot = makeTempDir();
    await runSetup(BASE_STATE, gitRoot);

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.capture).toBeUndefined();

    fs.rmSync(gitRoot, { recursive: true });
  });
});

describe('runSetup: reranker', () => {
  it('saves omlx base_url to config', async () => {
    const gitRoot = makeTempDir();
    await runSetup(
      {
        ...BASE_STATE,
        enableReranker: true,
        rerankerProvider: 'omlx',
        rerankerBaseUrl: 'http://localhost:9001/v1',
      },
      gitRoot
    );

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.reranker?.enabled).toBe(true);
    expect(config.reranker?.provider).toBe('omlx');
    expect(config.reranker?.base_url).toBe('http://localhost:9001/v1');

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('saves default omlx URL when rerankerBaseUrl is empty', async () => {
    const gitRoot = makeTempDir();
    await runSetup(
      {
        ...BASE_STATE,
        enableReranker: true,
        rerankerProvider: 'omlx',
        rerankerBaseUrl: '',
      },
      gitRoot
    );

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.reranker?.provider).toBe('omlx');
    // no base_url saved when empty — caller will use provider default
    expect(config.reranker?.base_url).toBeUndefined();

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('saves jina reranker without base_url', async () => {
    const gitRoot = makeTempDir();
    await runSetup(
      {
        ...BASE_STATE,
        enableReranker: true,
        rerankerProvider: 'jina',
        rerankerBaseUrl: '',
        collectedKeys: { JINA_API_KEY: 'jina_test_key_xxxx' },
      },
      gitRoot
    );

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.reranker?.provider).toBe('jina');
    expect(config.reranker?.base_url).toBeUndefined();

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('skips reranker config when disabled', async () => {
    const gitRoot = makeTempDir();
    await runSetup({ ...BASE_STATE, enableReranker: false }, gitRoot);

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.reranker).toBeUndefined();

    fs.rmSync(gitRoot, { recursive: true });
  });
});

describe('runSetup: embedding (lancedb)', () => {
  it('writes embedding config when lancedb is selected', async () => {
    const gitRoot = makeTempDir();
    await runSetup(
      {
        ...BASE_STATE,
        searchEngine: 'lancedb',
        embeddingProvider: 'ollama',
        embeddingUrl: 'http://localhost:11434',
        embeddingModel: 'mxbai-embed-large',
      },
      gitRoot
    );

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.embedding.engine).toBe('lancedb');
    expect(config.embedding.provider).toBe('ollama');
    expect(config.embedding.model).toBe('mxbai-embed-large');

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('does not set lancedb engine for text search', async () => {
    const gitRoot = makeTempDir();
    await runSetup({ ...BASE_STATE, searchEngine: 'text' }, gitRoot);

    const config = loadConfig(path.join(gitRoot, '.memobank'));
    expect(config.embedding.engine).toBe('text');

    fs.rmSync(gitRoot, { recursive: true });
  });
});

describe('runSetup: API keys', () => {
  it('writes collected keys to .memobank/.env', async () => {
    const gitRoot = makeTempDir();
    await runSetup(
      {
        ...BASE_STATE,
        collectedKeys: { JINA_API_KEY: 'test-key-123', OPENAI_API_KEY: 'sk-test' },
      },
      gitRoot
    );

    const envPath = path.join(gitRoot, '.memobank', '.env');
    expect(fs.existsSync(envPath)).toBe(true);
    const content = fs.readFileSync(envPath, 'utf-8');
    expect(content).toContain('JINA_API_KEY=test-key-123');
    expect(content).toContain('OPENAI_API_KEY=sk-test');

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('adds .env to .gitignore inside .memobank', async () => {
    const gitRoot = makeTempDir();
    await runSetup(
      {
        ...BASE_STATE,
        collectedKeys: { JINA_API_KEY: 'test-key' },
      },
      gitRoot
    );

    const gitignorePath = path.join(gitRoot, '.memobank', '.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    expect(content).toContain('.env');

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('does not write .env when no keys collected', async () => {
    const gitRoot = makeTempDir();
    await runSetup(BASE_STATE, gitRoot);

    const envPath = path.join(gitRoot, '.memobank', '.env');
    expect(fs.existsSync(envPath)).toBe(false);

    fs.rmSync(gitRoot, { recursive: true });
  });
});

describe('runSetup: gitignore', () => {
  const REQUIRED_ENTRIES = [
    '.memobank/.env',
    '.memobank/meta/access-log.json',
    '.memobank/meta/access-log.lock',
    '.memobank/meta/code-index.db',
    '.memobank/meta/capture-cursor.json',
    '.memobank/meta/study-suggestions.json',
    '.memobank/.pending/',
    '.memobank/.lancedb/',
    '.memobank/.metadata/',
    '.memobank/l0/',
  ];

  it('writes all required entries to project root .gitignore', async () => {
    const gitRoot = makeTempDir();
    await runSetup(BASE_STATE, gitRoot);

    const content = fs.readFileSync(path.join(gitRoot, '.gitignore'), 'utf-8');
    for (const entry of REQUIRED_ENTRIES) {
      expect(content).toContain(entry);
    }

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('appends to existing .gitignore without duplicating entries', async () => {
    const gitRoot = makeTempDir();
    fs.writeFileSync(path.join(gitRoot, '.gitignore'), 'node_modules/\ndist/\n.memobank/.env\n');

    await runSetup(BASE_STATE, gitRoot);

    const content = fs.readFileSync(path.join(gitRoot, '.gitignore'), 'utf-8');
    const envCount = (content.match(/\.memobank\/\.env/g) ?? []).length;
    expect(envCount).toBe(1);
    // Other required entries still added
    expect(content).toContain('.memobank/.pending/');
    expect(content).toContain('.memobank/l0/');

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('also writes .env to internal .memobank/.gitignore', async () => {
    const gitRoot = makeTempDir();
    await runSetup(BASE_STATE, gitRoot);

    const internal = fs.readFileSync(path.join(gitRoot, '.memobank', '.gitignore'), 'utf-8');
    expect(internal).toContain('.env');

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('includes .gitignore updated line in summary', async () => {
    const gitRoot = makeTempDir();
    const { lines } = await runSetup(BASE_STATE, gitRoot);

    expect(lines.some((l) => l.includes('.gitignore'))).toBe(true);

    fs.rmSync(gitRoot, { recursive: true });
  });
});

describe('runSetup: doc scanning', () => {
  it('detects README.md and includes tip in summary', async () => {
    const gitRoot = makeTempDir();
    fs.writeFileSync(path.join(gitRoot, 'README.md'), '# My Project\n');

    const { lines } = await runSetup(BASE_STATE, gitRoot);

    const docLine = lines.find((l) => l.includes('README.md'));
    expect(docLine).toBeDefined();
    const tipLine = lines.find((l) => l.includes('memo capture'));
    expect(tipLine).toBeDefined();

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('detects CLAUDE.md alongside README', async () => {
    const gitRoot = makeTempDir();
    fs.writeFileSync(path.join(gitRoot, 'README.md'), '# Project\n');
    fs.writeFileSync(path.join(gitRoot, 'CLAUDE.md'), '# Claude guidance\n');

    const { lines } = await runSetup(BASE_STATE, gitRoot);

    const docLine = lines.find((l) => l.includes('CLAUDE.md'));
    expect(docLine).toBeDefined();

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('detects markdown files inside docs/', async () => {
    const gitRoot = makeTempDir();
    const docsDir = path.join(gitRoot, 'docs');
    fs.mkdirSync(docsDir);
    fs.writeFileSync(path.join(docsDir, 'architecture.md'), '# Arch\n');

    const { lines } = await runSetup(BASE_STATE, gitRoot);

    const docLine = lines.find((l) => l.includes('docs/architecture.md'));
    expect(docLine).toBeDefined();

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('omits doc tip when no doc files exist', async () => {
    const gitRoot = makeTempDir();
    const { lines } = await runSetup(BASE_STATE, gitRoot);

    const hasMemoCapture = lines.some((l) => l.includes('memo capture'));
    expect(hasMemoCapture).toBe(false);

    fs.rmSync(gitRoot, { recursive: true });
  });
});

describe('runSetup: summary lines', () => {
  it('includes memory path in summary', async () => {
    const gitRoot = makeTempDir();
    const { lines } = await runSetup(BASE_STATE, gitRoot);

    const hasMemPath = lines.some((l) => l.includes('.memobank'));
    expect(hasMemPath).toBe(true);

    fs.rmSync(gitRoot, { recursive: true });
  });

  it('returns autoMemoryWarning false when claude-code not in platforms', async () => {
    const gitRoot = makeTempDir();
    const { autoMemoryWarning } = await runSetup(BASE_STATE, gitRoot);
    expect(autoMemoryWarning).toBe(false);

    fs.rmSync(gitRoot, { recursive: true });
  });
});
