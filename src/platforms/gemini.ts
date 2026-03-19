/**
 * Gemini CLI platform adapter
 * Injects auto-capture instruction into ~/.gemini/GEMINI.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const GEMINI_PROTOCOL = `
## Memobank Memory Protocol

At the end of each session, run: \`memo capture --auto --silent\`
This captures learnings into your persistent memory bank automatically.
`;

function getGeminiMdPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.gemini', 'GEMINI.md');
}

export function detectGemini(): boolean {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return (
    fs.existsSync(path.join(home, '.gemini')) ||
    isInPath('gemini')
  );
}

function isInPath(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export async function installGemini(): Promise<boolean> {
  const mdPath = getGeminiMdPath();
  const dir = path.dirname(mdPath);

  if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }

  let content = '';
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf-8');
    if (content.includes('memo capture --auto --silent')) {
      console.log('✓ Gemini: memobank protocol already installed');
      return true;
    }
  }

  fs.writeFileSync(mdPath, content + GEMINI_PROTOCOL, 'utf-8');
  console.log(`✓ Gemini: auto-capture protocol added to ${mdPath}`);
  return true;
}
