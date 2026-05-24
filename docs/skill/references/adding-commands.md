# Adding a New CLI Command

## File pattern

```typescript
// src/commands/<name>.ts
import { findRepoRoot } from '../core/store';
import { loadConfig } from '../config';

export interface MyCommandOptions {
  repo?: string;
  silent?: boolean;
}

export async function myCommand(options: MyCommandOptions = {}): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const config = loadConfig(repoRoot);
  // ...
}
```

## Registration pattern (src/cli.ts)

```typescript
import { myCommand } from './commands/my-command';

program
  .command('my-command')
  .description('One-line description')
  .option('--repo <path>', 'Memobank repository path')
  .option('--silent', 'Suppress output')
  .action(async (options) => {
    try {
      await myCommand(options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });
```

## Test pattern

```typescript
// tests/<name>.test.ts
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { myCommand } from '../src/commands/my-command';

async function setupTmpRepo(): Promise<string> {
  const dir = path.join(os.tmpdir(), `memobank-test-${Date.now()}`);
  fs.mkdirSync(path.join(dir, '.memobank', 'meta'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.memobank', 'meta', 'config.yaml'), 'project:\n  name: test\n');
  return dir;
}

describe('myCommand', () => {
  it('does X', async () => {
    const repo = await setupTmpRepo();
    await expect(myCommand({ repo, silent: true })).resolves.not.toThrow();
  });
});
```

## Rules

- No `console.log` in production code paths — use a `log` helper gated on `silent`
- Always handle the `--repo` option via `findRepoRoot(cwd, options.repo)`
- Export the handler function — `cli.ts` imports it; tests import it directly
- ESLint enforces: no `any`, explicit return types, `import type` for type-only imports
