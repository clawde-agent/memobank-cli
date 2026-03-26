/**
 * Qwen Code platform adapter
 * Injects auto-capture instruction into ~/.qwen/QWEN.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const QWEN_PROTOCOL = `
## Memobank Memory Protocol

This project uses memobank for persistent memory.

### Before Starting Work

Recall relevant project context:

\`\`\`bash
memo recall "project context"
\`\`\`

### After Finishing Work

Capture learnings and insights:

\`\`\`bash
memo capture --auto --silent
\`\`\`

### Useful Commands

- \`memo recall <query>\` - Search and display relevant memories
- \`memo search <query>\` - Debug search without updating MEMORY.md
- \`memo write <type>\` - Manually create a new memory
- \`memo map\` - Show memory summary
`;

function getQwenMdPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.qwen', 'QWEN.md');
}

export function detectQwen(): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return fs.existsSync(path.join(home, '.qwen')) || isInPath('qwen');
}

function isInPath(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function installQwen(): Promise<boolean> {
  const mdPath = getQwenMdPath();
  const dir = path.dirname(mdPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let content = '';
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf-8');
    if (content.includes('memo recall "project context"')) {
      console.log('✓ Qwen: memobank protocol already installed');
      return Promise.resolve(true);
    }
  }

  fs.writeFileSync(mdPath, content + QWEN_PROTOCOL, 'utf-8');
  console.log(`✓ Qwen: memobank protocol added to ${mdPath}`);
  return Promise.resolve(true);
}
