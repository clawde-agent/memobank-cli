import * as fs from 'fs';
import * as path from 'path';

const MEMOBANK_BLOCK_START = '# memobank:post-commit:start';
const MEMOBANK_BLOCK_END = '# memobank:end';

const HOOK_BLOCK = `${MEMOBANK_BLOCK_START}
# Auto-installed by memobank. Remove this block or run: memo hooks uninstall
changed=$(git diff-tree --no-commit-id -r --name-only HEAD 2>/dev/null | grep -E '\\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|cs|rb|swift|kt)$' || true)
if [ -n "$changed" ]; then
  echo "$changed" | while IFS= read -r f; do
    memo index-code --incremental "$f" >/dev/null 2>&1
  done &
fi
${MEMOBANK_BLOCK_END}`;

function getHookPath(gitRoot: string): string {
  // Detect husky
  const huskyDir = path.join(gitRoot, '.husky');
  if (fs.existsSync(huskyDir)) {
    return path.join(huskyDir, 'post-commit');
  }
  return path.join(gitRoot, '.git', 'hooks', 'post-commit');
}

export function installPostCommitHook(gitRoot: string): void {
  const hookPath = getHookPath(gitRoot);

  if (isHookInstalled(gitRoot)) {
    return; // idempotent
  }

  const shebang = '#!/bin/sh\n';
  let existing = '';
  if (fs.existsSync(hookPath)) {
    existing = fs.readFileSync(hookPath, 'utf-8');
  }

  const content = existing
    ? existing.trimEnd() + '\n\n' + HOOK_BLOCK + '\n'
    : shebang + HOOK_BLOCK + '\n';

  fs.writeFileSync(hookPath, content, { mode: 0o755 });
}

export function uninstallPostCommitHook(gitRoot: string): void {
  const hookPath = getHookPath(gitRoot);
  if (!fs.existsSync(hookPath)) return;

  const content = fs.readFileSync(hookPath, 'utf-8');
  const startIdx = content.indexOf(MEMOBANK_BLOCK_START);
  const endIdx = content.indexOf(MEMOBANK_BLOCK_END);
  if (startIdx === -1 || endIdx === -1) return;

  const before = content.slice(0, startIdx).trimEnd();
  const after = content.slice(endIdx + MEMOBANK_BLOCK_END.length).trimStart();
  const newContent = [before, after].filter(Boolean).join('\n') + '\n';

  if (newContent.trim() === '' || newContent.trim() === '#!/bin/sh') {
    fs.unlinkSync(hookPath);
  } else {
    fs.writeFileSync(hookPath, newContent);
  }
}

export function isHookInstalled(gitRoot: string): boolean {
  const hookPath = getHookPath(gitRoot);
  if (!fs.existsSync(hookPath)) return false;
  const content = fs.readFileSync(hookPath, 'utf-8');
  return content.includes(MEMOBANK_BLOCK_START);
}
