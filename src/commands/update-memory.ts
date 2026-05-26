import { findRepoRoot } from '../core/dir-resolver';
import { updateMemoryContent } from '../core/store';
import { loadAll } from '../core/memory-loader';

export interface UpdateMemoryOptions {
  name: string;
  content: string;
  repo?: string;
}

export async function updateMemoryCommand(options: UpdateMemoryOptions): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd(), options.repo);
  const memories = loadAll(repoRoot, 'project');
  const target = memories.find((m) => m.name === options.name);
  if (!target) {
    throw new Error(`Memory not found: ${options.name}`);
  }
  updateMemoryContent(repoRoot, options.name, options.content);
}
