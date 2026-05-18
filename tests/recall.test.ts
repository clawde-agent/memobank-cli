import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// We test the engine-selection logic extracted from recallCommand.
// Import the helper once it's created in Task 3 Step 3.
import { selectEngine } from '../src/commands/recall';
import { TextEngine } from '../src/engines/text-engine';

function makeTempRepo(engine: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memo-recall-'));
  fs.mkdirSync(path.join(dir, 'meta'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'meta', 'config.yaml'),
    `project:\n  name: test\nembedding:\n  engine: ${engine}\n`
  );
  return dir;
}

describe('selectEngine', () => {
  it('returns TextEngine when config engine is "text"', async () => {
    const repoRoot = makeTempRepo('text');
    const { engine, warning } = await selectEngine('text', repoRoot, {} as any);
    expect(engine).toBeInstanceOf(TextEngine);
    expect(warning).toBeNull();
    fs.rmSync(repoRoot, { recursive: true });
  });

  it('falls back to TextEngine with warning when lancedb unavailable', async () => {
    const repoRoot = makeTempRepo('lancedb');
    // No API key set — embedding will fail
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const { engine, warning } = await selectEngine('lancedb', repoRoot, {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 1536,
    } as any);
    expect(engine).toBeInstanceOf(TextEngine);
    expect(warning).toMatch(/vector search unavailable/i);
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
    fs.rmSync(repoRoot, { recursive: true });
  });
});
