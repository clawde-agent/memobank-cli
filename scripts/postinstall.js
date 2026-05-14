#!/usr/bin/env node
// Checks that optional heavy dependencies extracted correctly after npm install.
// Works around https://github.com/npm/cli/issues/4828 (optional deps sometimes
// install package.json only, skipping dist/).

const { existsSync, readdirSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

function check(pkg, distRelPath) {
  const pkgDir = path.join(root, 'node_modules', pkg);
  if (!existsSync(pkgDir)) return; // optional — not installed, skip silently

  const distDir = path.join(pkgDir, distRelPath);
  if (existsSync(distDir) && readdirSync(distDir).length > 0) return; // OK

  console.warn(`\n⚠️  memobank: ${pkg} dist/ is missing (npm optional-deps bug).`);
  console.warn(`   Attempting auto-fix: npm install ${pkg} --force --legacy-peer-deps\n`);
  try {
    execSync(`npm install ${pkg} --force --legacy-peer-deps`, {
      cwd: root,
      stdio: 'inherit',
    });
    console.log(`✓  ${pkg} fixed.\n`);
  } catch {
    console.error(`✗  Auto-fix failed. Run manually:\n   npm install ${pkg} --force --legacy-peer-deps\n`);
  }
}

check('@lancedb/lancedb', 'dist');
