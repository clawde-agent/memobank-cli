/**
 * Gemini CLI platform adapter
 * Injects auto-capture instruction into ~/.gemini/GEMINI.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const GEMINI_PROTOCOL = `
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

function getGeminiMdPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.gemini', 'GEMINI.md');
}

export function detectGemini(): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return fs.existsSync(path.join(home, '.gemini')) || isInPath('gemini');
}

function isInPath(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function installGemini(): Promise<boolean> {
  const mdPath = getGeminiMdPath();
  const dir = path.dirname(mdPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let content = '';
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf-8');
    if (content.includes('memo recall "project context"')) {
      console.log('✓ Gemini: memobank protocol already installed');
      return Promise.resolve(true);
    }
  }

  fs.writeFileSync(mdPath, content + GEMINI_PROTOCOL, 'utf-8');
  console.log(`✓ Gemini: memobank protocol added to ${mdPath}`);
  return Promise.resolve(true);
}
