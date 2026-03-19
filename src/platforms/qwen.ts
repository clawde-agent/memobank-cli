/**
 * Qwen Code platform adapter
 * Injects auto-capture instruction into ~/.qwen/QWEN.md
 */

import * as fs from 'fs';
import * as path from 'path';

const QWEN_PROTOCOL = `
## Memobank Memory Protocol

At the end of each session, run: \`memo capture --auto --silent\`
This captures learnings into your persistent memory bank automatically.
`;

function getQwenMdPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.qwen', 'QWEN.md');
}

export function detectQwen(): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return (
    fs.existsSync(path.join(home, '.qwen')) ||
    isInPath('qwen')
  );
}

function isInPath(cmd: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execSync } = require('child_process') as typeof import('child_process');
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export async function installQwen(): Promise<boolean> {
  const mdPath = getQwenMdPath();
  const dir = path.dirname(mdPath);

  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }

  let content = '';
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf-8');
    if (content.includes('memo capture --auto --silent')) {
      console.log('✓ Qwen: memobank protocol already installed');
      return true;
    }
  }

  fs.writeFileSync(mdPath, content + QWEN_PROTOCOL, 'utf-8');
  console.log(`✓ Qwen: auto-capture protocol added to ${mdPath}`);
  return true;
}
