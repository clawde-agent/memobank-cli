#!/usr/bin/env node
// Checks that optional heavy dependencies extracted correctly after npm install.
// Works around https://github.com/npm/cli/issues/4828 (optional deps sometimes
// install package.json only, skipping dist/).
//
// We only WARN here — auto-running `npm install --force` inside a postinstall
// hook causes nested npm invocations that can corrupt other packages in CI.

const { existsSync, readdirSync } = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function check(pkg, distRelPath) {
  const pkgDir = path.join(root, 'node_modules', pkg);
  if (!existsSync(pkgDir)) return; // optional — not installed, skip silently

  const distDir = path.join(pkgDir, distRelPath);
  if (existsSync(distDir) && readdirSync(distDir).length > 0) return; // OK

  console.warn(
    `\n⚠️  memobank: ${pkg} dist/ is missing (npm optional-deps extraction bug).` +
    `\n   Fix with: npm install ${pkg} --force --legacy-peer-deps\n`
  );
}

check('@lancedb/lancedb', 'dist');
