import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanFile, scanDirectory } from '../src/commands/scan';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memo-scan-test-'));
}

describe('scanFile', () => {
  it('returns empty array for clean file', () => {
    const tmp = makeTempDir();
    const file = path.join(tmp, 'clean.md');
    fs.writeFileSync(file, '# Clean memory\n\nThis is safe content.');
    const findings = scanFile(file);
    expect(findings).toHaveLength(0);
    fs.rmSync(tmp, { recursive: true });
  });

  it('detects secret in file', () => {
    const tmp = makeTempDir();
    const file = path.join(tmp, 'secret.md');
    fs.writeFileSync(file, '# Setup\n\nThe password is mysupersecret123');
    const findings = scanFile(file);
    expect(findings.length).toBeGreaterThan(0);
    fs.rmSync(tmp, { recursive: true });
  });
});

describe('scanDirectory', () => {
  it('returns empty when no .md files have secrets', () => {
    const tmp = makeTempDir();
    fs.writeFileSync(path.join(tmp, 'a.md'), '# Safe\n\nNo secrets here.');
    const results = scanDirectory(tmp);
    expect(results).toHaveLength(0);
    fs.rmSync(tmp, { recursive: true });
  });

  it('finds secrets across multiple files', () => {
    const tmp = makeTempDir();
    fs.writeFileSync(path.join(tmp, 'a.md'), '# Safe\n\nNo secrets.');
    fs.writeFileSync(path.join(tmp, 'b.md'), '# Risky\n\npassword is abc');
    const results = scanDirectory(tmp);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toContain('b.md');
    fs.rmSync(tmp, { recursive: true });
  });
});
