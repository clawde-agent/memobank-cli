import * as path from 'path';
import * as childProcess from 'child_process';
import { findRepoRoot } from '../core/store';
import { processQueue } from '../core/queue-processor';

export interface ProcessQueueOptions {
  background: boolean;
}

export async function runProcessQueue(
  memoBankDir: string,
  options: ProcessQueueOptions
): Promise<number> {
  if (options.background) {
    const cliPath = path.join(__dirname, '..', 'cli.js');
    const child = childProcess.spawn(process.execPath, [cliPath, 'process-queue'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return 0;
  }

  try {
    await processQueue(memoBankDir);
    return 0;
  } catch (err) {
    console.error(`process-queue failed: ${(err as Error).message}`);
    return 1;
  }
}

export async function processQueueCommand(options: { background?: boolean } = {}): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const code = await runProcessQueue(repoRoot, { background: options.background ?? false });
  process.exitCode = code;
}
